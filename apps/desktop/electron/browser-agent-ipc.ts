import { BrowserWindow, ipcMain, MessageChannelMain, shell, utilityProcess, type MessagePortMain, type WebContents } from "electron";
import type { NexoCore } from "@nexo/core";
import { BrowserAgentService, type BrowserWorkerFactory } from "@nexo/core/browser-agent";
import type { BrowserAgentControl, BrowserFrame } from "@nexo/shared/browser-agent";

export type BrowserAgentDesktopOptions = { dataDir:string; workerEntry:string };

type FrameSubscription = { webContents:WebContents; port:MessagePortMain };

export async function registerBrowserAgentIpc(core:NexoCore, options:BrowserAgentDesktopOptions) {
  assertSupportedNode();
  const service = new BrowserAgentService({
    dataDir:options.dataDir,
    db:core.db,
    approvals:core.approvals,
    security:core.security,
    settings:() => core.getSettings(),
    workerFactory:createUtilityWorkerFactory(options.workerEntry)
  });
  await core.registerBrowserAgentModule(service);

  const frameSubscriptions = new Map<string,FrameSubscription>();
  const keyFor = (contents:WebContents, runId:string) => `${contents.id}:${runId}`;
  const broadcast = (channel:string, payload:unknown) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(channel, payload);
  };
  const offEvents = service.events.subscribe(event => broadcast("nexo:browser-agent:event", event));
  const offFrames = service.events.subscribeFrames(frame => {
    for (const [key, subscription] of frameSubscriptions) {
      if (subscription.webContents.isDestroyed()) { subscription.port.close(); frameSubscriptions.delete(key); continue; }
      if (!key.endsWith(`:${frame.runId}`)) continue;
      subscription.port.postMessage(framePayload(frame));
    }
  });

  ipcMain.handle("nexo:browser-agent:get", (_event, runId:string) => service.get(runId));
  ipcMain.handle("nexo:browser-agent:list", (_event, conversationId?:string) => service.list(conversationId));
  ipcMain.handle("nexo:browser-agent:events", (_event, runId:string) => service.eventsFor(runId));
  ipcMain.handle("nexo:browser-agent:control", (_event, control:BrowserAgentControl) => service.control(control));
  ipcMain.handle("nexo:browser-agent:approval", (_event, approvalId:string, approved:boolean) => service.resolveApproval(approvalId, approved));
  ipcMain.handle("nexo:browser-agent:personal-profile:get", () => service.personalProfileEnabled());
  ipcMain.handle("nexo:browser-agent:personal-profile:set", (_event, enabled:boolean) => service.setPersonalProfileEnabled(Boolean(enabled)));
  ipcMain.handle("nexo:browser-agent:open", async (_event, runId:string) => {
    const run = service.get(runId);
    if (!run?.currentUrl || !/^https?:\/\//i.test(run.currentUrl)) throw new Error("Esta execução ainda não possui uma página HTTP(S) para abrir.");
    await shell.openExternal(run.currentUrl);
    return true;
  });
  ipcMain.handle("nexo:browser-agent:subscribe-frames", (event, runId:string) => {
    const id = String(runId);
    if (!service.get(id)) throw new Error("Execução do Browser Agent não encontrada.");
    const key = keyFor(event.sender, id);
    frameSubscriptions.get(key)?.port.close();
    const { port1, port2 } = new MessageChannelMain();
    frameSubscriptions.set(key, { webContents:event.sender, port:port1 });
    port1.start();
    event.sender.postMessage("nexo:browser-agent:frame-port", {runId:id}, [port2]);
    const lastFrame = service.latestFrame(id);
    if (lastFrame) port1.postMessage(framePayload(lastFrame));
    event.sender.once("destroyed", () => {
      const current = frameSubscriptions.get(key);
      current?.port.close();
      frameSubscriptions.delete(key);
    });
    return true;
  });
  ipcMain.handle("nexo:browser-agent:unsubscribe-frames", (event, runId:string) => {
    const key = keyFor(event.sender, String(runId));
    frameSubscriptions.get(key)?.port.close();
    frameSubscriptions.delete(key);
    return true;
  });

  return {
    service,
    async shutdown() {
      offEvents();
      offFrames();
      for (const subscription of frameSubscriptions.values()) subscription.port.close();
      frameSubscriptions.clear();
      await service.shutdown();
    }
  };
}

function createUtilityWorkerFactory(workerEntry:string):BrowserWorkerFactory {
  return () => {
    const child = utilityProcess.fork(workerEntry, [], {serviceName:"Nexo Browser Agent", stdio:"pipe"});
    child.stdout?.on("data", chunk => {
      const message = String(chunk).trim();
      if (message) console.info(`[BrowserAgentWorker] ${message}`);
    });
    child.stderr?.on("data", chunk => {
      const message = String(chunk).trim();
      if (message) console.error(`[BrowserAgentWorker] ${message}`);
    });
    child.on("spawn", () => console.info(`[BrowserAgentWorker] iniciado pid=${child.pid ?? "n/a"}`));
    return {
      postMessage:message => child.postMessage(message),
      kill:() => child.kill(),
      onMessage:listener => {
        const handler = (message:unknown) => listener(message as Parameters<typeof listener>[0]);
        child.on("message", handler);
        return () => child.off("message", handler);
      },
      onExit:listener => {
        const handler = (code:number) => listener(code);
        child.on("exit", handler);
        return () => child.off("exit", handler);
      }
    };
  };
}

function framePayload(frame:BrowserFrame) {
  return { runId:frame.runId, sequence:frame.sequence, width:frame.width, height:frame.height, timestamp:frame.timestamp, bytes:frame.bytes };
}

function assertSupportedNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) {
    throw new Error(`Browser Agent requer Node 22.19+ no Electron. Runtime atual: ${process.versions.node}.`);
  }
}
