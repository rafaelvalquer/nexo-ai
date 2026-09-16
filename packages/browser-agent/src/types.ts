import type {
  BrowserAgentErrorCode,
  BrowserAgentMode,
  BrowserDiagnosticEventName,
  BrowserModelTurnTelemetry,
  BrowserResearchResult,
  BrowserRunPhase
} from "@nexo/shared/browser-agent";

export type BrowserWorkerRunConfig = {
  runId: string;
  request: string;
  cdpUrl: string;
  workspace: string;
  ollamaUrl: string;
  model: string;
  mode: BrowserAgentMode;
  allowedDomains: string[];
  maxSteps: number;
  timeoutMs: number;
};

export type BrowserWorkerCommand =
  | { type: "run"; config: BrowserWorkerRunConfig }
  | { type: "pause"; runId: string }
  | { type: "resume"; runId: string }
  | { type: "steer"; runId: string; instruction: string }
  | { type: "cancel"; runId: string }
  | { type: "approval.resolve"; requestId: string; approved: boolean };

export type BrowserWorkerMessage =
  | { type: "ready"; nodeVersion: string }
  | { type: "started"; runId: string }
  | { type: "phase"; runId: string; phase: BrowserRunPhase }
  | { type: "diagnostic"; runId: string; event: BrowserDiagnosticEventName; durationMs?: number; metadata?:BrowserModelTurnTelemetry }
  | { type: "step"; runId: string; label: string; step: number; action?: boolean }
  | { type: "status"; runId: string; status: "paused" | "running" }
  | { type: "approval.requested"; runId: string; requestId: string; reason: string; preview: string }
  | { type: "completed"; runId: string; result: BrowserResearchResult; steps: number; durationMs: number }
  | { type: "failed"; runId: string; error: string; errorCode?: BrowserAgentErrorCode; cancelled?: boolean }
  | { type: "log"; runId?: string; level: "info" | "warn" | "error"; message: string };
