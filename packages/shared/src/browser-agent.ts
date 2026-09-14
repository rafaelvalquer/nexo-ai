export type BrowserRunStatus =
  | "starting"
  | "running"
  | "paused"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type BrowserAgentMode = "research" | "personal";

export type BrowserResearchResult = {
  summary: string;
  sources: Array<{ title: string; url: string; excerpt?: string }>;
  findings: Array<{ title: string; summary: string; sourceUrl: string }>;
};

export type BrowserRun = {
  id: string;
  taskId: string;
  conversationId: string;
  request: string;
  status: BrowserRunStatus;
  mode: BrowserAgentMode;
  allowedDomains: string[];
  currentUrl?: string;
  pageTitle?: string;
  currentStep?: string;
  stepCount: number;
  startedAt: string;
  finishedAt?: string;
  finalResult?: BrowserResearchResult;
  finalThumbnail?: string;
  error?: string;
};

export type BrowserRunEvent =
  | { type: "browser.started"; runId: string; timestamp: string }
  | { type: "browser.navigation"; runId: string; url: string; title?: string; timestamp: string }
  | { type: "browser.step"; runId: string; label: string; step: number; timestamp: string }
  | { type: "browser.status"; runId: string; status: BrowserRunStatus; timestamp: string }
  | { type: "browser.approval_requested"; runId: string; approvalId: string; label: string; preview?: string; timestamp: string }
  | { type: "browser.completed"; runId: string; result?: BrowserResearchResult; timestamp: string }
  | { type: "browser.failed"; runId: string; error: string; timestamp: string }
  | { type: "browser.cancelled"; runId: string; timestamp: string };

export type BrowserFrame = {
  runId: string;
  sequence: number;
  width: number;
  height: number;
  timestamp: number;
  bytes: Uint8Array;
};

export type BrowserRunBlock = {
  id: string;
  version: 1;
  type: "browser_run";
  runId: string;
  title: string;
  status: Exclude<BrowserRunStatus, "starting">;
  url?: string;
  pageTitle?: string;
  step?: string;
  startedAt: string;
  finishedAt?: string;
  finalThumbnail?: string;
};

export type BrowserAgentStartRequest = {
  conversationId: string;
  taskId?: string;
  request: string;
  mode?: BrowserAgentMode;
  allowedDomains?: string[];
  maxSteps?: number;
  timeoutMs?: number;
};

export type BrowserAgentControl =
  | { action: "pause"; runId: string }
  | { action: "resume"; runId: string }
  | { action: "cancel"; runId: string }
  | { action: "steer"; runId: string; instruction: string };

export type BrowserAgentToolResult = {
  command: "started" | "steered";
  run: BrowserRun;
};

export interface BrowserAgentProvider {
  run(input: BrowserAgentStartRequest, signal?: AbortSignal): Promise<BrowserRun>;
  pause(runId: string): Promise<void>;
  resume(runId: string): Promise<void>;
  steer(runId: string, instruction: string): Promise<void>;
  cancel(runId: string): Promise<void>;
}
