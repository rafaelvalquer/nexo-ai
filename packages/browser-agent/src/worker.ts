import { randomUUID } from "node:crypto";
import type { BrowserWorkerCommand, BrowserWorkerMessage } from "./types.js";

type ParentPort = {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};

type BrowserAgentRunnerInstance = import("./runner.js").BrowserAgentRunner;

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort | null }).parentPort;
if (!parentPort) throw new Error("Browser Agent worker deve ser iniciado por Electron utilityProcess.");

let currentRunId: string | undefined;
let runnerPromise: Promise<BrowserAgentRunnerInstance> | undefined;
const pendingApprovals = new Map<string, (approved: boolean) => void>();
const emit = (message: BrowserWorkerMessage) => parentPort.postMessage(message);
const rejectPendingApprovals = () => {
  for (const resolve of pendingApprovals.values()) resolve(false);
  pendingApprovals.clear();
};

const approvalGate = (request: { reason: string; preview: string }, signal?: AbortSignal) => new Promise<boolean>(resolve => {
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
});

function getRunner() {
  runnerPromise ??= import("./runner.js").then(({ BrowserAgentRunner }) => new BrowserAgentRunner(emit, approvalGate));
  return runnerPromise;
}

function requireRunner() {
  if (!runnerPromise) throw new Error("Browser Agent ainda não iniciou uma execução.");
  return runnerPromise;
}

parentPort.on("message", event => {
  const command = event.data as BrowserWorkerCommand;
  void handle(command).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    if (command.type === "run") {
      emit({ type: "failed", runId: command.config.runId, error: `Falha ao inicializar o Browser Agent: ${message}` });
      return;
    }
    emit({ type: "log", runId: currentRunId, level: "error", message });
  });
});

// O processo está pronto para receber comandos assim que o canal IPC existe.
// Browser Use Pi é carregado de forma lazy no primeiro comando "run" para que
// imports pesados ou falhas de dependência não sejam mascarados como timeout de bootstrap.
emit({ type: "ready", nodeVersion: process.versions.node });

async function handle(command: BrowserWorkerCommand) {
  switch (command.type) {
    case "run": {
      currentRunId = command.config.runId;
      try {
        const runner = await getRunner();
        await runner.run(command.config);
      } finally {
        rejectPendingApprovals();
        currentRunId = undefined;
      }
      return;
    }
    case "pause": {
      const runner = await requireRunner();
      await runner.pause(command.runId);
      return;
    }
    case "resume": {
      const runner = await requireRunner();
      await runner.resume(command.runId);
      return;
    }
    case "steer": {
      const runner = await requireRunner();
      runner.steer(command.runId, command.instruction);
      return;
    }
    case "cancel": {
      rejectPendingApprovals();
      const runner = await requireRunner();
      runner.cancel(command.runId);
      return;
    }
    case "approval.resolve":
      pendingApprovals.get(command.requestId)?.(command.approved);
      pendingApprovals.delete(command.requestId);
      return;
  }
}
