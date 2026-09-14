import { randomUUID } from "node:crypto";
import { BrowserAgentRunner } from "./runner.js";
import type { BrowserWorkerCommand, BrowserWorkerMessage } from "./types.js";

type ParentPort = {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};
const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort | null }).parentPort;
if (!parentPort) throw new Error("Browser Agent worker deve ser iniciado por Electron utilityProcess.");

let currentRunId: string | undefined;
const pendingApprovals = new Map<string, (approved: boolean) => void>();
const emit = (message: BrowserWorkerMessage) => parentPort.postMessage(message);
const rejectPendingApprovals = () => {
  for (const resolve of pendingApprovals.values()) resolve(false);
  pendingApprovals.clear();
};
const runner = new BrowserAgentRunner(emit, (request, signal) => new Promise<boolean>(resolve => {
  const requestId = randomUUID();
  const settle = (approved: boolean) => {
    signal?.removeEventListener("abort", abort);
    resolve(approved);
  };
  const abort = () => { pendingApprovals.delete(requestId); settle(false); };
  if (signal?.aborted) return settle(false);
  signal?.addEventListener("abort", abort, { once: true });
  pendingApprovals.set(requestId, settle);
  emit({ type: "approval.requested", runId: currentRunId ?? "", requestId, reason: request.reason, preview: request.preview });
}));

parentPort.on("message", event => {
  const command = event.data as BrowserWorkerCommand;
  void handle(command).catch(error => emit({ type: "log", runId: currentRunId, level: "error", message: error instanceof Error ? error.message : String(error) }));
});

async function handle(command: BrowserWorkerCommand) {
  switch (command.type) {
    case "run":
      currentRunId = command.config.runId;
      try { await runner.run(command.config); } finally { rejectPendingApprovals(); currentRunId = undefined; }
      return;
    case "pause": await runner.pause(command.runId); return;
    case "resume": await runner.resume(command.runId); return;
    case "steer": runner.steer(command.runId, command.instruction); return;
    case "cancel": rejectPendingApprovals(); runner.cancel(command.runId); return;
    case "approval.resolve": pendingApprovals.get(command.requestId)?.(command.approved); pendingApprovals.delete(command.requestId); return;
  }
}

emit({ type: "ready", nodeVersion: process.versions.node });
