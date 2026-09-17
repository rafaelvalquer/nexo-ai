import type { ChatBlock, ChatPresentation } from "./chat.js";
export * from "./chat.js";
export * from "./automation.js";
export type RiskLevel = "READ" | "SAFE_WRITE" | "SENSITIVE" | "CRITICAL";

export type ToolRequest = { name: string; input: Record<string, unknown> };
export type ToolResult = { ok: boolean; summary: string; data?: unknown; error?: string };

export type VisualExecutionContext = { visualRunId:string; taskId?:string; agentRunId?:string; conversationId?:string; agentId?:string };
export type Approval = {
  id:string; createdAt:string; toolName:string; input:Record<string,unknown>; risk:RiskLevel; reason:string;
  status:"pending"|"approved"|"rejected"|"expired"; agentRunId?:string; checkpointId?:string; visualRunId?:string; taskId?:string;
  domain?:string;actionType?:string;preview?:string;affectedCount?:number;consequence?:string;fingerprint?:string;executionId?:string;expiresAt?:string;
};

export type ChatMessage = {
  blocks?: ChatBlock[];
  id:string; conversationId?:string; role:"user"|"assistant"|"system"; content:string; createdAt:string; taskId?:string; documentIds?:string[];
};
export type ConversationSummary={id:string;title:string;createdAt:string;updatedAt:string};
export type ChatSessionStatus="idle"|"running"|"waiting_review"|"waiting_approval"|"completed"|"failed";

export type BackgroundTaskStatus = "queued" | "running" | "waiting_review" | "waiting_approval" | "completed" | "failed" | "cancelled";

export type AgentVisualEventType = "agent.online"|"agent.offline"|"run.created"|"run.classifying"|"run.planning"|"tool.started"|"tool.progress"|"tool.completed"|"approval.requested"|"approval.resolved"|"response.streaming"|"run.completed"|"run.failed"|"run.cancelled";
export type AgentOperationalState = "idle"|"interpreting"|"planning"|"walking"|"executing-tool"|"awaiting-approval"|"responding"|"success"|"error"|"offline"|"cancelled";
export type OfficeStationId = "central-desk"|"document-station"|"mail-station"|"calendar-station"|"browser-station"|"system-station"|"approval-gate"|"rest-area";
export type AgentVisualEvent = {
  eventId:string;runId:string;agentId:string;conversationId?:string;timestamp:string;type:AgentVisualEventType;state:AgentOperationalState;label:string;
  toolName?:string;stationId?:OfficeStationId;progress?:number;severity?:"info"|"success"|"warning"|"error";approvalId?:string;taskId?:string;agentRunId?:string;metadata?:Record<string,unknown>
};
export type AgentVisualSnapshot = { current?:AgentVisualEvent; recent:AgentVisualEvent[] };
export type OfficeRunState={runId:string;agentId:string;conversationId?:string;state:AgentOperationalState;stationId:OfficeStationId;label:string;taskId?:string;startedAt?:string};

export type BackgroundTask = {
  presentation?: ChatPresentation; pendingApprovalId?: string; pendingReviewDraftId?:string;
  id:string;type:string;status:BackgroundTaskStatus;input:Record<string,unknown>;result?:unknown;error?:string;createdAt:string;startedAt?:string;finishedAt?:string;
  progressText?:string;statusMessage?:string;statusHistory?:string[];conversationId?:string;agentId?:string;runId?:string;
};

export type Automation = {
  id:string;name:string;enabled:boolean;triggerType:"cron"|"file-created"|"file-changed"|"app-start"|"manual";schedule?:string;watchPath?:string;command:string;lastRunAt?:string;
};

export type NexoSettings = {
  model:string;ollamaUrl:string;autonomy:"cautious"|"balanced"|"autonomous";allowedRoots:string[];privateMode:boolean;runInBackground:boolean;
  memoryEnabled:boolean;memoryAskBeforeSave:boolean;intentLearningEnabled?:boolean;embeddingModel:string;documentMaxSizeMb:number;externalDataRetention:"session"|"local";connectionsEnabled:boolean;
  browserAutomationEnabled:boolean;fileWritesEnabled:boolean;requireApprovalForEmail:boolean;allowedDomains:string[];dataRetentionDays:number;onboardingCompleted:boolean;ocrEnabled:boolean;
  executionTimeoutMinutes:number|null;maxConcurrentChatSessions:number;maxConcurrentLLMRequests:number;oauth:OAuthConfiguration;
  agentLoopMode?:"legacy"|"read_only"|"shadow"|"full";forceLegacyAgent?:boolean;
  settingsSchemaVersion?:number;agentLoopModeExplicitlySelected?:boolean;agentLegacyFallbackEnabled?:boolean;developerDiagnosticsEnabled?:boolean;
};

export type OAuthConfiguration = { googleClientId:string;microsoftClientId:string;microsoftTenant:string };
export type ConnectionProvider = "google" | "microsoft";
export type ConnectionCapability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";
export type ConnectionStatus = "not-configured" | "authorizing" | "connecting" | "validating" | "connected" | "degraded" | "refreshing" | "expired" | "reauthorization-required" | "error" | "admin-consent-required";
export type CapabilityGrantState = "not-requested" | "requested" | "granted" | "validated" | "denied" | "unavailable" | "reauthorization-required";
export type CapabilityValidationSource = "token-response" | "tokeninfo" | "api-probe";
export type GoogleScopeEvidenceSource = "token-response" | "tokeninfo" | "unknown";
export type CapabilityGrant = {
  capability:ConnectionCapability;
  requested:boolean;
  expectedScopes:string[];
  granted:boolean;
  grantedByScope?:string;
  validated:boolean;
  status:CapabilityGrantState;
  validationSource?:CapabilityValidationSource;
  providerReason?:string;
  providerMessage?:string;
  httpStatus?:number;
  lastValidatedAt?:string;
};
/** A capability may be used only after it was requested, granted and validated. */
export function isCapabilityOperational(grant:CapabilityGrant|undefined):boolean {
  return Boolean(grant?.requested&&grant.granted&&grant.validated&&grant.status==="validated");
}
export type ConnectionAccount = {
  id:string;provider:ConnectionProvider;accountEmail?:string;displayName?:string;capabilities:ConnectionCapability[];requestedCapabilities?:ConnectionCapability[];grantedScopes?:string[];
  capabilityGrants?:CapabilityGrant[];oauthClientId?:string;scopeSource?:GoogleScopeEvidenceSource;
  status:ConnectionStatus;lastError?:string;updatedAt:string;lastConnectedAt?:string;lastValidatedAt?:string;lastRefreshAt?:string;tokenExpiresAt?:string;providerAccountId?:string;
  lastHealthCheckAt?:string;reauthorizationReason?:string;
};
export type ConnectionDiagnosticSnapshot = {
  provider:ConnectionProvider;
  status:ConnectionStatus;
  accountEmail?:string;
  oauthClientId?:string;
  configuredClientId?:string;
  clientMatches?:boolean;
  tokenPresent:boolean;
  refreshTokenPresent:boolean;
  requestedCapabilities:ConnectionCapability[];
  grantedScopes:string[];
  scopeSource?:GoogleScopeEvidenceSource;
  capabilities:CapabilityGrant[];
  lastValidatedAt?:string;
  lastRefreshAt?:string;
  lastHealthCheckAt?:string;
};
export type ConnectionResolution =
  | { status:"ready"; account:ConnectionAccount }
  | { status:"not_connected" }
  | { status:"missing_capability"; account:ConnectionAccount }
  | { status:"expired"; account:ConnectionAccount }
  | { status:"needs_reauthorization"; account:ConnectionAccount };
export type DocumentStatus = "importing" | "extracting" | "indexing" | "ready" | "failed";
export type DocumentRecord = { id:string;name:string;mimeType:string;sizeBytes:number;status:DocumentStatus;metadata?:Record<string,unknown>;createdAt:string;updatedAt:string };
export type ChatAttachment = { id:string;documentId:string;name:string;mimeType:string;sizeBytes:number;status:"importing"|"ready"|"failed" };
