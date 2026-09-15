import type { BrowserFrame } from "@nexo/shared/browser-agent";

type FrameHandler = (frame: BrowserFrame) => void;
type NavigationHandler = (url: string, title?: string) => void;
type TargetInfo = { targetId:string; type:string; url?:string };
type CdpEnvelope = { id?:number; method?:string; params?:Record<string,unknown>; result?:Record<string,unknown>; error?:{message?:string}; sessionId?:string };

/** CDP-only observer. It follows the agent-owned page, never controls actions and never persists frames. */
export class LiveViewService {
  private socket?: WebSocket;
  private commandId = 0;
  private sequence = 0;
  private targetId?: string;
  private targetSessionId?: string;
  private stopped = false;
  private fallbackTimer?: ReturnType<typeof setInterval>;
  private frameWatchdog?: ReturnType<typeof setTimeout>;
  private pending = new Map<number, { resolve:(value:Record<string,unknown>)=>void; reject:(error:Error)=>void; timeout:ReturnType<typeof setTimeout> }>();
  private lastFrameAt = 0;
  private captureSessions = new Set<string>();
  private captureFailures = 0;
  private switchChain:Promise<void> = Promise.resolve();

  constructor(private readonly runId:string, private readonly endpoint:string, private readonly onFrame:FrameHandler, private readonly onNavigation:NavigationHandler) {}

  async start() {
    this.stopped = false;
    this.socket = new WebSocket(this.endpoint);
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      socket.addEventListener("open", () => resolve(), { once:true });
      socket.addEventListener("error", () => reject(new Error("Falha ao conectar ao Chrome DevTools Protocol.")), { once:true });
    });
    this.socket.addEventListener("message", event => void this.handleMessage(String(event.data)));
    this.socket.addEventListener("close", () => this.rejectPending(new Error("Conexão CDP encerrada.")));
    await this.send("Target.setDiscoverTargets", { discover:true }).catch(() => undefined);
    const targets = await this.send("Target.getTargets");
    const pages = ((targets.targetInfos ?? []) as TargetInfo[]).filter(target => target.type === "page" && !target.url?.startsWith("devtools://"));
    const initial = pages.at(-1);
    if (initial) await this.queueSwitch(initial.targetId);
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    if (this.frameWatchdog) clearTimeout(this.frameWatchdog);
    this.fallbackTimer = undefined;
    this.frameWatchdog = undefined;
    await this.stopCurrentTarget();
    this.socket?.close();
    this.socket = undefined;
    this.rejectPending(new Error("Live view finalizada."));
  }

  private async handleMessage(raw:string) {
    let message:CdpEnvelope;
    try { message = JSON.parse(raw) as CdpEnvelope; } catch { return; }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message ?? "Erro CDP"));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method === "Target.targetCreated" || message.method === "Target.targetInfoChanged") {
      const info = (message.params?.targetInfo ?? {}) as Partial<TargetInfo>;
      if (info.type === "page" && info.targetId && !info.url?.startsWith("devtools://")) {
        // Browser Use creates an agent-owned page on external CDP sessions. Prefer the newest/non-blank target.
        if (info.targetId !== this.targetId && (message.method === "Target.targetCreated" || Boolean(info.url && info.url !== "about:blank"))) this.queueSwitch(info.targetId);
        else if (info.targetId === this.targetId && info.url && info.url !== "about:blank") void this.emitLocation(info.url);
      }
      return;
    }
    if (message.method === "Page.screencastFrame" && message.sessionId === this.targetSessionId) {
      const params = message.params ?? {};
      const frameSessionId = Number(params.sessionId);
      if (Number.isFinite(frameSessionId)) void this.send("Page.screencastFrameAck", { sessionId:frameSessionId }, this.targetSessionId).catch(() => undefined);
      const now = Date.now();
      if (now - this.lastFrameAt < 250) return; // 4 FPS max.
      const data = typeof params.data === "string" ? params.data : "";
      const metadata = (params.metadata ?? {}) as Record<string,unknown>;
      if (data) {
        this.lastFrameAt = now;
        if (this.fallbackTimer) { clearInterval(this.fallbackTimer); this.fallbackTimer = undefined; }
        this.onFrame({
          runId:this.runId,
          sequence:++this.sequence,
          width:Math.max(1, Number(metadata.deviceWidth ?? 960) || 960),
          height:Math.max(1, Number(metadata.deviceHeight ?? 540) || 540),
          timestamp:now,
          bytes:Uint8Array.from(Buffer.from(data, "base64"))
        });
      }
      return;
    }
    if (message.method === "Page.frameNavigated" && message.sessionId === this.targetSessionId) {
      const frame = (message.params?.frame ?? {}) as Record<string,unknown>;
      if (!frame.parentId && typeof frame.url === "string") void this.emitLocation(frame.url);
    }
  }

  private queueSwitch(targetId:string) {
    this.switchChain = this.switchChain.then(() => this.switchToTarget(targetId)).catch(() => { console.warn(`[BrowserLiveView] run=${this.runId} target_attach_failed`); });
    return this.switchChain;
  }

  private async switchToTarget(targetId:string) {
    if (this.stopped || targetId === this.targetId) return;
    await this.stopCurrentTarget();
    if (this.stopped) return;
    const attached = await this.send("Target.attachToTarget", { targetId, flatten:true });
    const sessionId = String(attached.sessionId ?? "");
    if (!sessionId) throw new Error("CDP não retornou uma sessão para a página do Browser Agent.");
    this.targetId = targetId;
    this.targetSessionId = sessionId;
    this.lastFrameAt = 0;
    await this.send("Page.enable", {}, sessionId);
    await this.send("Runtime.enable", {}, sessionId).catch(() => undefined);
    await this.emitLocation();
    try {
      await this.send("Page.startScreencast", { format:"jpeg", quality:60, maxWidth:960, maxHeight:540, everyNthFrame:1 }, sessionId);
      // Some Chrome targets accept screencast but never emit frames. Do not leave
      // the renderer on an indefinite black placeholder in that case.
      this.frameWatchdog = setInterval(() => {
        if (!this.stopped && this.targetSessionId === sessionId && Date.now() - this.lastFrameAt > 1_500) this.startFallback();
      }, 500);
      this.frameWatchdog.unref?.();
      void this.captureFallback();
    } catch {
      this.startFallback();
    }
  }

  private async stopCurrentTarget() {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    if (this.frameWatchdog) clearTimeout(this.frameWatchdog);
    this.fallbackTimer = undefined;
    this.frameWatchdog = undefined;
    const sessionId = this.targetSessionId;
    this.targetSessionId = undefined;
    this.targetId = undefined;
    if (!sessionId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    await this.send("Page.stopScreencast", {}, sessionId).catch(() => undefined);
    await this.send("Target.detachFromTarget", { sessionId }).catch(() => undefined);
  }

  private async emitLocation(urlHint?:string) {
    if (!this.targetSessionId) return;
    let title:string|undefined;
    try {
      const result = await this.send("Runtime.evaluate", { expression:"document.title", returnByValue:true }, this.targetSessionId);
      title = String(((result.result as Record<string,unknown>|undefined)?.value) ?? "") || undefined;
    } catch {}
    let url = urlHint;
    if (!url) {
      try {
        const result = await this.send("Runtime.evaluate", { expression:"location.href", returnByValue:true }, this.targetSessionId);
        url = String(((result.result as Record<string,unknown>|undefined)?.value) ?? "");
      } catch {}
    }
    if (url) this.onNavigation(url, title);
  }

  private startFallback() {
    if (this.fallbackTimer) return;
    this.fallbackTimer = setInterval(() => void this.captureFallback(), 500);
    this.fallbackTimer.unref?.();
    void this.captureFallback();
  }
  private async captureFallback() {
    if (this.stopped || !this.targetSessionId) return;
    const sessionId = this.targetSessionId;
    if (this.captureSessions.has(sessionId)) return;
    this.captureSessions.add(sessionId);
    try {
      const result = await this.send("Page.captureScreenshot", { format:"jpeg", quality:60, captureBeyondViewport:false }, sessionId);
      if (this.stopped || this.targetSessionId !== sessionId) return;
      const data = typeof result.data === "string" ? result.data : "";
      if (!data) throw new Error("Empty screenshot");
      this.captureFailures = 0;
      if (data) this.onFrame({ runId:this.runId, sequence:++this.sequence, width:960, height:540, timestamp:Date.now(), bytes:Uint8Array.from(Buffer.from(data, "base64")) });
    } catch { if (!this.stopped && this.targetSessionId === sessionId) console.warn(`[BrowserLiveView] run=${this.runId} screenshot_failed count=${++this.captureFailures}`); }
    finally { this.captureSessions.delete(sessionId); }
  }

  private send(method:string, params:Record<string,unknown> = {}, sessionId?:string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP não conectado."));
    const id = ++this.commandId;
    return new Promise<Record<string,unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`Timeout CDP em ${method}.`));
      }, 10_000);
      timeout.unref?.();
      this.pending.set(id, { resolve, reject, timeout });
      this.socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  private rejectPending(error:Error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
  }
}
