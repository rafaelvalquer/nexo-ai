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
  embeddingModel: string;
  documentMaxSizeMb: number;
  externalDataRetention: "session" | "local";
  connectionsEnabled: boolean;
  ocrEnabled: boolean;
};

export type ConnectionProvider = "google" | "microsoft";
export type ConnectionCapability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";
export type ConnectionStatus = "not-configured" | "connecting" | "connected" | "expired" | "error" | "admin-consent-required";
export type ConnectionAccount = { id: string; provider: ConnectionProvider; accountEmail?: string; displayName?: string; capabilities: ConnectionCapability[]; status: ConnectionStatus; lastError?: string; updatedAt: string };
export type DocumentStatus = "importing" | "extracting" | "indexing" | "ready" | "failed";
export type DocumentRecord = { id: string; name: string; mimeType: string; sizeBytes: number; status: DocumentStatus; metadata?: Record<string, unknown>; createdAt: string; updatedAt: string };
export type ChatAttachment = { id: string; documentId: string; name: string; mimeType: string; sizeBytes: number; status: "importing" | "ready" | "failed" };
