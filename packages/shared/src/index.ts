export type RiskLevel = "READ" | "SAFE_WRITE" | "SENSITIVE" | "CRITICAL";

export type ToolRequest = {
  name: string;
  input: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
};

export type Approval = {
  id: string;
  createdAt: string;
  toolName: string;
  input: Record<string, unknown>;
  risk: RiskLevel;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  taskId?: string;
};

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type BackgroundTask = {
  id: string;
  type: string;
  status: BackgroundTaskStatus;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progressText?: string;
  statusMessage?: string;
  statusHistory?: string[];
};

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: "cron" | "file-created";
  schedule?: string;
  watchPath?: string;
  command: string;
  lastRunAt?: string;
};

export type NexoSettings = {
  model: string;
  ollamaUrl: string;
  autonomy: "cautious" | "balanced" | "autonomous";
  allowedRoots: string[];
  privateMode: boolean;
  runInBackground: boolean;
  memoryEnabled: boolean;
  memoryAskBeforeSave: boolean;
};
