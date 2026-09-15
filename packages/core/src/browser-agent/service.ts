import { randomUUID } from "node:crypto";
import type { ApprovalService } from "../permissions/approvals.js";
import type { SecurityPolicyService } from "../security/policy.js";
import type { NexoDatabase } from "../database/db.js";
import type { BrowserWorkerMessage } from "@nexo/browser-agent";
import type {
  BrowserAgentControl,
  BrowserAgentProvider,
  BrowserAgentStartRequest,
  BrowserAgentToolResult,
  BrowserFrame,
  BrowserResearchResult,
  BrowserRun,
  BrowserRunEvent
} from "@nexo/shared/browser-agent";
import { BrowserEventBus } from "./event-bus.js";
import { LiveViewService } from "./live-view-service.js";
import { BrowserAgentPolicy } from "./policy.js";
import { BrowserRunRepository } from "./repository.js";
import { validateBrowserResearchResult } from "./result-validator.js";
import { BrowserAgentSessionManager, type BrowserAgentSession } from "./session-manager.js";
import { BrowserAgentWorkerController, type BrowserWorkerFactory } from "./worker-controller.js";

type RunContext = {
  deadline?: ReturnType<typeof setTimeout>;
  run: BrowserRun;
  session: BrowserAgentSession;
  live: LiveViewService;
  worker: BrowserAgentWorkerController;
  lastFrame?: BrowserFrame;
  approvalRequests: Map<string,string>;
};

export type BrowserAgentServiceOptions = {
  dataDir: string;
  db: NexoDatabase;
  approvals: ApprovalService;
  security: SecurityPolicyService;
  workerFactory: BrowserWorkerFactory;
  settings: () => { ollamaUrl:string; model:string; allowedDomains:string[]; browserAutomationEnabled:boolean };
};

export class BrowserAgentService implements BrowserAgentProvider {
  readonly events = new BrowserEventBus();
  readonly repository: BrowserRunRepository;
  private readonly policy: BrowserAgentPolicy;
  private readonly sessions: BrowserAgentSessionManager;
  private readonly active = new Map<string,RunContext>();
  private readonly approvalToRun = new Map<string,{runId:string;requestId:string}>();

  constructor(private readonly options:BrowserAgentServiceOptions) {
    this.repository = new BrowserRunRepository(options.db);
    this.repository.recoverInterrupted();
    this.policy = new BrowserAgentPolicy(options.security);
    this.sessions = new BrowserAgentSessionManager(options.dataDir);
  }

  async run(input:BrowserAgentStartRequest, signal?:AbortSignal) {
    return this.start(input, signal);
  }

  async startOrSteer(input:BrowserAgentStartRequest, signal?:AbortSignal):Promise<BrowserAgentToolResult> {
    const existing = [...this.active.values()].find(item => item.run.conversationId === input.conversationId);
    if (existing) {
      const instruction = input.request.trim();
      if (!instruction) throw new Error("A orientação não pode estar vazia.");
      if (signal?.aborted) throw signal.reason ?? new DOMException("Execução cancelada.", "AbortError");
      existing.worker.send({ type:"steer", runId:existing.run.id, instruction });
      existing.run.currentStep = "Orientação recebida";
      this.emit({ type:"browser.step", runId:existing.run.id, label:"Orientação recebida", step:existing.run.stepCount, timestamp:new Date().toISOString() });
      return { command:"steered", run:structuredClone(existing.run) };
    }
    return { command:"started", run:await this.start(input, signal) };
  }

  async start(input:BrowserAgentStartRequest, signal?:AbortSignal) {
    this.policy.assertEnabled();
    const request = input.request.trim();
    if (!request) throw new Error("Informe o que o Browser Agent deve fazer.");
    if (signal?.aborted) throw signal.reason ?? new DOMException("Execução cancelada.", "AbortError");
    const mode = input.mode ?? "research";
    const timeoutMs = clamp(input.timeoutMs ?? (mode === "research" ? 600_000 : 120_000), 10_000, 600_000);
    this.policy.assertMode(mode, this.repository.personalProfileEnabled());
    const configured = this.policy.normalizeDomains(input.allowedDomains?.length ? input.allowedDomains : []);
    const inferred = this.policy.domainsFromRequest(request);
    const allowedDomains = configured.length ? configured : inferred;
    if (!allowedDomains.length) throw new Error("Não consegui determinar com segurança o domínio a acessar. Informe o site ou a URL desejada.");

    const run:BrowserRun = {
      id:randomUUID(),
      taskId:input.taskId ?? randomUUID(),
      conversationId:input.conversationId,
      request,
      status:"starting",
      mode,
      timeoutMs,
      allowedDomains,
      stepCount:0,
      startedAt:new Date().toISOString()
    };
    this.repository.create(run);
    this.repository.update(run.id, {timeoutMs});
    this.emit({ type:"browser.started", runId:run.id, timestamp:new Date().toISOString() });

    let session:BrowserAgentSession|undefined;
    try {
      session = await this.sessions.create(run.id, mode);
      signal?.throwIfAborted();
      const worker = new BrowserAgentWorkerController(this.options.workerFactory);
      const live = new LiveViewService(
        run.id,
        session.cdpUrl,
        frame => this.handleFrame(run.id, frame),
        (url, title) => this.handleNavigation(run.id, url, title)
      );
      const context:RunContext = { run, session, live, worker, approvalRequests:new Map() };
      this.active.set(run.id, context);
      await live.start();
      signal?.throwIfAborted();
      await worker.start(
        message => { void this.handleWorkerMessage(run.id, message).catch(error => {
          const text = error instanceof Error ? error.message : String(error);
          void this.finish(run.id, "failed", `Falha ao processar evento do Browser Agent: ${text}`).catch(() => undefined);
        }); },
        code => void this.handleWorkerExit(run.id, code)
      );
      run.status = "running";
      signal?.throwIfAborted();
      context.deadline = setTimeout(() => {
        context.run.cancelReason = "timeout";
        context.run.errorCode = "BROWSER_TIMEOUT";
        void this.finish(run.id, "failed", "A pesquisa atingiu o limite de tempo (BROWSER_TIMEOUT).");
      }, timeoutMs);
      context.deadline.unref?.();
      this.repository.update(run.id, {status:"running"});
      this.emit({ type:"browser.status", runId:run.id, status:"running", timestamp:new Date().toISOString() });
      // The chat/tool signal is only valid while bootstrapping the Browser Agent.
      // Once the worker is running, this background run owns its lifecycle and is
      // stopped only by explicit browser cancellation, its own timeout or shutdown.
      worker.send({
        type:"run",
        config:{
          runId:run.id,
          request,
          cdpUrl:session.cdpUrl,
          workspace:this.sessions.workspace(run.id),
          ollamaUrl:this.options.settings().ollamaUrl,
          model:this.options.settings().model,
          mode,
          allowedDomains,
          maxSteps:clamp(input.maxSteps ?? 30, 1, 80),
          timeoutMs
        }
      });
      return structuredClone(run);
    } catch (error) {
      const context = this.active.get(run.id);
      if (context) { clearTimeout(context.deadline); await context.live.stop().catch(() => undefined); context.worker.stop(); }
      this.active.delete(run.id);
      if (session) await session.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      run.status = "failed";
      run.error = message;
      run.finishedAt = new Date().toISOString();
      this.repository.update(run.id, {status:"failed", error:message, finishedAt:run.finishedAt});
      this.emit({ type:"browser.failed", runId:run.id, error:message, timestamp:run.finishedAt });
      throw error;
    }
  }

  async control(control:BrowserAgentControl) {
    switch (control.action) {
      case "pause": return this.pause(control.runId);
      case "resume": return this.resume(control.runId);
      case "cancel": return this.cancel(control.runId);
      case "steer": return this.steer(control.runId, control.instruction);
    }
  }
  async pause(runId:string) { this.requireActive(runId).worker.send({type:"pause", runId}); }
  async resume(runId:string) { this.requireActive(runId).worker.send({type:"resume", runId}); }
  async cancel(runId:string) { const context = this.active.get(runId); if (context) { context.run.cancelReason = "user"; await this.finish(runId, "cancelled", "Execução cancelada pelo usuário."); } }
  async steer(runId:string, instruction:string) {
    const value = instruction.trim();
    if (!value) throw new Error("A orientação não pode estar vazia.");
    this.requireActive(runId).worker.send({type:"steer", runId, instruction:value});
  }

  async resolveApproval(approvalId:string, approved:boolean) {
    const mapping = this.approvalToRun.get(approvalId);
    if (!mapping) throw new Error("Aprovação do Browser Agent não encontrada ou já resolvida.");
    const context = this.requireActive(mapping.runId);
    this.options.approvals.resolve(approvalId, approved);
    context.worker.send({type:"approval.resolve", requestId:mapping.requestId, approved});
    context.approvalRequests.delete(mapping.requestId);
    this.approvalToRun.delete(approvalId);
    context.run.status = approved ? "running" : "cancelled";
    if (approved) {
      this.repository.update(mapping.runId, {status:"running"});
      this.emit({type:"browser.status", runId:mapping.runId, status:"running", timestamp:new Date().toISOString()});
    } else {
      await this.cancel(mapping.runId);
    }
    return this.get(mapping.runId);
  }

  get(runId:string) { const active = this.active.get(runId)?.run; return active ? structuredClone(active) : this.repository.get(runId); }
  latestFrame(runId:string) { return this.active.get(runId)?.lastFrame; }
  list(conversationId?:string) { return this.repository.list(conversationId); }
  eventsFor(runId:string) { return this.repository.events(runId); }
  activeForConversation(conversationId:string) {
    const active = [...this.active.values()].find(item => item.run.conversationId === conversationId);
    return active ? structuredClone(active.run) : undefined;
  }
  personalProfileEnabled() { return this.repository.personalProfileEnabled(); }
  setPersonalProfileEnabled(enabled:boolean) { return this.repository.setPersonalProfileEnabled(enabled); }

  async shutdown() {
    await Promise.all([...this.active.values()].map(context => { context.run.cancelReason="shutdown"; return this.finish(context.run.id, "failed", "Execução interrompida pelo encerramento do aplicativo."); }));
  }

  private async handleWorkerMessage(runId:string, message:BrowserWorkerMessage) {
    const context = this.active.get(runId);
    if (!context || ("runId" in message && message.runId && message.runId !== runId)) return;
    switch (message.type) {
      case "ready": return;
      case "started": context.run.status = "running"; return;
      case "step":
        context.run.currentStep = message.label;
        context.run.stepCount = Math.max(context.run.stepCount, message.step);
        this.repository.update(runId, {steps:context.run.stepCount});
        this.emit({type:"browser.step", runId, label:message.label, step:context.run.stepCount, timestamp:new Date().toISOString()});
        return;
      case "status":
        context.run.status = message.status;
        this.repository.update(runId, {status:message.status});
        this.emit({type:"browser.status", runId, status:message.status, timestamp:new Date().toISOString()});
        return;
      case "approval.requested": {
        const approval = this.options.approvals.create(
          "browser_agent_action",
          {runId, preview:message.preview},
          "CRITICAL",
          message.reason,
          undefined,
          {domain:"browser", actionType:"browser_action", preview:message.preview, consequence:"O Browser Agent executará uma ação sensível no site após a confirmação."}
        );
        context.approvalRequests.set(message.requestId, approval.id);
        this.approvalToRun.set(approval.id, {runId, requestId:message.requestId});
        context.run.status = "waiting_approval";
        this.repository.update(runId, {status:"waiting_approval"});
        this.emit({type:"browser.approval_requested", runId, approvalId:approval.id, label:message.reason, preview:message.preview, timestamp:new Date().toISOString()});
        return;
      }
      case "completed": {
        const result = validateBrowserResearchResult(message.result, context.run.allowedDomains);
        context.run.finalResult = result;
        context.run.stepCount = message.steps;
        await this.finish(runId, "completed", undefined, result);
        return;
      }
      case "failed": await this.finish(runId, message.cancelled ? "cancelled" : "failed", message.error); return;
      case "log": return;
    }
  }

  private handleWorkerExit(runId:string, code:number) {
    if (this.active.has(runId)) void this.finish(runId, "failed", `Browser Agent worker encerrou inesperadamente (código ${code}).`);
  }
  private handleFrame(runId:string, frame:BrowserFrame) {
    const context = this.active.get(runId);
    if (!context) return;
    context.lastFrame = frame;
    this.events.publishFrame(frame);
  }
  private handleNavigation(runId:string, url:string, title?:string) {
    const context = this.active.get(runId);
    if (!context) return;
    context.run.currentUrl = url;
    context.run.pageTitle = title;
    this.emit({type:"browser.navigation", runId, url, title, timestamp:new Date().toISOString()});
  }

  private async finish(runId:string, status:"completed"|"failed"|"cancelled", error?:string, result?:BrowserResearchResult) {
    const context = this.active.get(runId);
    if (!context) return;
    this.active.delete(runId);
    this.repository.update(runId, {errorCode:context.run.errorCode,cancelReason:context.run.cancelReason,timeoutMs:context.run.timeoutMs});
    clearTimeout(context.deadline);
    context.run.status = status;
    context.run.error = error;
    context.run.finalResult = result ?? context.run.finalResult;
    context.run.finishedAt = new Date().toISOString();
    let thumbnail:string|undefined;
    if (context.lastFrame) {
      thumbnail = `data:image/jpeg;base64,${Buffer.from(context.lastFrame.bytes).toString("base64")}`;
      context.run.finalThumbnail = thumbnail;
    }
    this.repository.update(runId, {status, error, result:context.run.finalResult, steps:context.run.stepCount, finalUrl:context.run.currentUrl, finishedAt:context.run.finishedAt, finalThumbnail:thumbnail});
    await context.live.stop().catch(() => undefined);
    context.worker.stop();
    await context.session.close().catch(() => undefined);
    for (const [requestId, approvalId] of context.approvalRequests) {
      this.approvalToRun.delete(approvalId);
      context.approvalRequests.delete(requestId);
    }
    if (status === "completed") this.emit({type:"browser.completed", runId, result:context.run.finalResult, timestamp:context.run.finishedAt});
    else if (status === "cancelled") this.emit({type:"browser.cancelled", runId, timestamp:context.run.finishedAt});
    else this.emit({type:"browser.failed", runId, error:error ?? "Falha no Browser Agent.", timestamp:context.run.finishedAt});
  }

  private emit(event:BrowserRunEvent) { const identified = {...event,id:event.id ?? randomUUID()}; this.repository.recordEvent(identified); this.events.publish(identified); }
  private requireActive(runId:string) { const context = this.active.get(runId); if (!context) throw new Error("Execução do Browser Agent não está ativa."); return context; }
}

function clamp(value:number, min:number, max:number) { return Math.min(max, Math.max(min, Math.trunc(value))); }
