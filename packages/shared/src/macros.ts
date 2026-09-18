export type EmailMailboxCategory = "primary" | "promotions" | "social" | "updates" | "forums";

export type MacroRunStatus = "queued" | "running" | "waiting_approval" | "success" | "failed" | "skipped" | "cancelled";
export type MacroStatus = "active" | "paused" | "running" | "waiting_approval" | "attention";
export type MacroConditionOperator = "equals" | "notEquals" | "contains" | "notContains" | "startsWith" | "endsWith" | "greaterThan" | "lessThan" | "exists";
export type MacroConditionLogicalOperator = "AND" | "OR";

export type ScheduleTrigger = {
  type: "schedule";
  mode: "cron" | "once" | "daily" | "weekdays" | "weekends" | "weekly" | "monthly" | "specific-days";
  cron?: string;
  at?: string;
  time?: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
};

export type IntervalTrigger = { type: "interval"; minutes: number };
export type ManualTrigger = { type: "manual" };
export type AppStartTrigger = { type: "app-start" };
export type FileCreatedTrigger = { type: "file.created"; path: string; debounceMs?: number };
export type FileChangedTrigger = { type: "file.changed"; path: string; debounceMs?: number };
export type FileDeletedTrigger = { type: "file.deleted"; path: string; debounceMs?: number };
export type EmailReceivedTrigger = { type: "email.received"; connectionId: string; categories?: EmailMailboxCategory[]; pollIntervalMinutes: number };
export type CalendarBeforeEventTrigger = { type: "calendar.before_event"; connectionId: string; minutesBefore: number; pollIntervalMinutes?: number };
export type CalendarEventStartedTrigger = { type: "calendar.event_started"; connectionId: string; pollIntervalMinutes?: number };
export type SystemThresholdTrigger = {
  type: "system.threshold";
  metric: "disk_usage" | "memory_usage";
  operator: "gt" | "gte" | "lt" | "lte";
  threshold: number;
  checkIntervalMinutes: number;
};

export type MacroTrigger =
  | ScheduleTrigger
  | IntervalTrigger
  | ManualTrigger
  | AppStartTrigger
  | FileCreatedTrigger
  | FileChangedTrigger
  | FileDeletedTrigger
  | EmailReceivedTrigger
  | CalendarBeforeEventTrigger
  | CalendarEventStartedTrigger
  | SystemThresholdTrigger;

export type MacroCondition = {
  id: string;
  field: string;
  operator: MacroConditionOperator;
  value?: unknown;
};

export type MacroStep = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  continueOnError?: boolean;
  condition?: MacroCondition;
};

export type MacroOutput =
  | { type: "notification" }
  | { type: "chat"; conversationMode: "automation" | "existing" }
  | { type: "silent" };

export type MacroPolicy = {
  maxConcurrentRuns: number;
  retries: { enabled: boolean; count: number };
  onRepeatedFailure: "pause" | "continue";
};

export type Macro = {
  id: string;
  version: 2;
  name: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  trigger: MacroTrigger;
  conditions: MacroCondition[];
  conditionOperator: MacroConditionLogicalOperator;
  actions: MacroStep[];
  output: MacroOutput;
  prompt?: string;
  policy: MacroPolicy;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: MacroRunStatus;
  consecutiveFailures: number;
};

export type MacroExecutionContext = {
  automationId: string;
  runId: string;
  trigger: { type: string; data: Record<string, unknown> };
  actionResults: Record<string, unknown>;
  startedAt: string;
};

export type MacroStepRun = {
  id: string;
  runId: string;
  ordinal: number;
  actionId: string;
  actionType: string;
  status: MacroRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  approvalId?: string;
};

export type MacroRun = {
  id: string;
  automationId: string;
  triggerType: string;
  status: MacroRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  taskId?: string;
  conversationId?: string;
  approvalId?: string;
  steps?: MacroStepRun[];
};

export type MacroView = Macro & {
  status: MacroStatus;
  triggerLabel: string;
  actionSummary: string;
};

export type MacroCapability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";
export type MacroPresetCategory = "productivity" | "email" | "calendar" | "filesystem" | "system" | "browser";
export type MacroPreset = {
  id: string;
  version: number;
  category: MacroPresetCategory;
  title: string;
  description: string;
  icon: string;
  requiredCapabilities: MacroCapability[];
  automation: {
    name: string;
    description?: string;
    icon?: string;
    trigger: MacroTrigger;
    conditions: MacroCondition[];
    conditionOperator?: MacroConditionLogicalOperator;
    actions: MacroStep[];
    output?: MacroOutput;
    policy?: MacroPolicy;
    prompt?: string;
  };
};

export type MacroExecutionResult = {
  automationId: string;
  runId: string;
  conversationId: string;
  taskId: string;
};

export type CreateMacroInput = Omit<Macro, "id" | "version" | "createdAt" | "updatedAt" | "nextRunAt" | "lastRunAt" | "lastRunStatus" | "consecutiveFailures">;
export type UpdateMacroInput = Partial<Omit<CreateMacroInput, "enabled">> & { enabled?: boolean };

export const DEFAULT_MACRO_POLICY: MacroPolicy = {
  maxConcurrentRuns: 1,
  retries: { enabled: true, count: 2 },
  onRepeatedFailure: "pause"
};

/** Every automation run is presented as a dedicated Assistant conversation. */
export const DEFAULT_MACRO_OUTPUT: MacroOutput = { type: "chat", conversationMode: "automation" };
