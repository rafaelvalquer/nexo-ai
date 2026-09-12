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
  agentRunId?: string;
  checkpointId?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  taskId?: string;
};

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type AgentVisualEventType = "run.created"|"run.classifying"|"run.planning"|"tool.started"|"tool.progress"|"tool.completed"|"approval.requested"|"approval.resolved"|"response.streaming"|"run.completed"|"run.failed"|"run.cancelled";
export type AgentOperationalState = "idle"|"interpreting"|"planning"|"walking"|"executing-tool"|"awaiting-approval"|"responding"|"success"|"error"|"offline"|"cancelled";
export type OfficeStationId = "central-desk"|"document-station"|"mail-station"|"calendar-station"|"browser-station"|"system-station"|"approval-gate"|"rest-area";
export type AgentVisualEvent = { eventId:string;runId:string;agentId:string;timestamp:string;type:AgentVisualEventType;state:AgentOperationalState;label:string;toolName?:string;stationId?:OfficeStationId;progress?:number;severity?:"info"|"success"|"warning"|"error";approvalId?:string;metadata?:Record<string,unknown> };
export type AgentVisualSnapshot = { current?:AgentVisualEvent; recent:AgentVisualEvent[] };

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
  triggerType: "cron" | "file-created" | "file-changed" | "app-start" | "manual";
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
  browserAutomationEnabled: boolean;
  fileWritesEnabled: boolean;
  requireApprovalForEmail: boolean;
  allowedDomains: string[];
  dataRetentionDays: number;
  onboardingCompleted: boolean;
  ocrEnabled: boolean;
  oauth: OAuthConfiguration;
};

/** Public OAuth application identifiers only. User tokens are stored separately in the OS secret store. */
export type OAuthConfiguration = {
  googleClientId: string;
  microsoftClientId: string;
  microsoftTenant: string;
};

export type ConnectionProvider = "google" | "microsoft";
export type ConnectionCapability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";
export type ConnectionStatus = "not-configured" | "connecting" | "connected" | "refreshing" | "expired" | "error" | "admin-consent-required";
export type ConnectionAccount = { id: string; provider: ConnectionProvider; accountEmail?: string; displayName?: string; capabilities: ConnectionCapability[]; status: ConnectionStatus; lastError?: string; updatedAt: string; lastConnectedAt?: string; lastValidatedAt?: string; lastRefreshAt?: string; tokenExpiresAt?: string; providerAccountId?: string };
export type DocumentStatus = "importing" | "extracting" | "indexing" | "ready" | "failed";
export type DocumentRecord = { id: string; name: string; mimeType: string; sizeBytes: number; status: DocumentStatus; metadata?: Record<string, unknown>; createdAt: string; updatedAt: string };
export type ChatAttachment = { id: string; documentId: string; name: string; mimeType: string; sizeBytes: number; status: "importing" | "ready" | "failed" };
