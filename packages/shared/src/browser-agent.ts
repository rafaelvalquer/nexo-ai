export type BrowserRunStatus =
  | "starting"
  | "running"
  | "paused"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type BrowserRunPhase =
  | "initializing"
  | "launching_browser"
  | "browser_ready"
  | "checking_model"
  | "loading_agent"
  | "waiting_model"
  | "agent_ready"
  | "executing"
  | "finishing";

export type BrowserDiagnosticEventName =
  | "browser_process_started"
  | "cdp_connected"
  | "ollama_check_started"
  | "ollama_check_completed"
  | "ollama_request_started"
  | "ollama_request_completed"
  | "agent_loading"
  | "agent_loaded"
  | "agent_created"
  | "first_turn_started"
  | "first_model_response_started"
  | "first_model_response_delta"
  | "first_model_response_completed"
  | "first_model_tool_call_received"
  | "model_turn_completed"
  | "first_action_started"
  | "first_navigation";

export type BrowserModelTurnTelemetry = {
  model:string;
  durationMs:number;
  firstChunkMs:number|null;
  contentLength:number;
  thinkingLength:number;
  structuredToolCallCount:number;
  qwenMarkupToolCallCount:number;
  invalidMarkupCount:number;
  toolNames:string[];
  doneReason:string;
  promptTokens:number;
  completionTokens:number;
  totalTokens:number;
  recoveryAttempt:boolean;
};

export type BrowserAgentErrorCode =
  | "BROWSER_CHROME_NOT_FOUND"
  | "BROWSER_CHROME_START_FAILED"
  | "BROWSER_CDP_STARTUP_TIMEOUT"
  | "BROWSER_CDP_CONNECTION_FAILED"
  | "BROWSER_OLLAMA_UNAVAILABLE"
  | "BROWSER_OLLAMA_TIMEOUT"
  | "BROWSER_MODEL_CONFIG_INVALID"
  | "BROWSER_MODEL_NOT_FOUND"
  | "BROWSER_MODEL_INVALID_RESPONSE"
  | "BROWSER_MODEL_INCOMPATIBLE"
  | "BROWSER_MODEL_TOOL_CALL_UNSUPPORTED"
  | "BROWSER_MODEL_NO_TOOL_CALL"
  | "BROWSER_PROVIDER_FIRST_CHUNK_TIMEOUT"
  | "BROWSER_MODEL_TURN_TIMEOUT"
  | "BROWSER_AGENT_LOAD_FAILED"
  | "BROWSER_AGENT_INIT_TIMEOUT"
  | "BROWSER_FIRST_ACTION_TIMEOUT"
  | "BROWSER_NAVIGATION_FAILED"
  | "BROWSER_TIMEOUT"
  | "BROWSER_ABORT_INTERNAL";

export type BrowserAgentMode = "research" | "personal";

export type BrowserResearchResult = {
  summary: string;
  sources: Array<{ title: string; url: string; excerpt?: string }>;
  findings: Array<{ title: string; summary: string; sourceUrl: string }>;
};

export type BrowserRun = {
  errorCode?: BrowserAgentErrorCode;
  cancelReason?: "user" | "timeout" | "shutdown" | "parent_startup_abort" | "internal";
  timeoutMs?: number;
  id: string;
  taskId: string;
  conversationId: string;
  request: string;
  status: BrowserRunStatus;
  phase?: BrowserRunPhase;
  phaseStartedAt?: string;
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

export type BrowserRunEvent = { id?: string } & (
  | { type: "browser.started"; runId: string; timestamp: string }
  | { type: "browser.navigation"; runId: string; url: string; title?: string; timestamp: string }
  | { type: "browser.step"; runId: string; label: string; step: number; timestamp: string }
  | { type: "browser.status"; runId: string; status: BrowserRunStatus; timestamp: string }
  | { type: "browser.phase"; runId: string; phase: BrowserRunPhase; timestamp: string }
  | { type: "browser.diagnostic"; runId: string; event: BrowserDiagnosticEventName; durationMs?: number; metadata?:BrowserModelTurnTelemetry; timestamp: string }
  | { type: "browser.approval_requested"; runId: string; approvalId: string; label: string; preview?: string; timestamp: string }
  | { type: "browser.completed"; runId: string; result?: BrowserResearchResult; timestamp: string }
  | { type: "browser.failed"; runId: string; error: string; errorCode?: BrowserAgentErrorCode; timestamp: string }
  | { type: "browser.cancelled"; runId: string; timestamp: string });

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
  status: BrowserRunStatus;
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
