export type EmailMailboxCategory = "primary" | "promotions" | "social" | "updates" | "forums";

export type AutomationRunStatus = "queued" | "running" | "waiting_approval" | "success" | "failed" | "skipped" | "cancelled";
export type AutomationStatus = "active" | "paused" | "running" | "waiting_approval" | "attention";
export type AutomationConditionOperator = "equals" | "notEquals" | "contains" | "notContains" | "startsWith" | "endsWith" | "greaterThan" | "lessThan" | "exists";
export type AutomationConditionLogicalOperator = "AND" | "OR";

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

export type AutomationTrigger =
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

export type AutomationCondition = {
  id: string;
  field: string;
  operator: AutomationConditionOperator;
  value?: unknown;
};

export type AutomationAction = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  continueOnError?: boolean;
  condition?: AutomationCondition;
};

export type AutomationOutput =
  | { type: "notification" }
  | { type: "chat"; conversationMode: "automation" | "existing" }
  | { type: "silent" };

export type AutomationPolicy = {
  maxConcurrentRuns: number;
  retries: { enabled: boolean; count: number };
  onRepeatedFailure: "pause" | "continue";
};

export type AutomationV2 = {
  id: string;
  version: 2;
  name: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  conditionOperator: AutomationConditionLogicalOperator;
  actions: AutomationAction[];
  output: AutomationOutput;
  prompt?: string;
  policy: AutomationPolicy;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: AutomationRunStatus;
  consecutiveFailures: number;
};

export type AutomationExecutionContext = {
  automationId: string;
  runId: string;
  trigger: { type: string; data: Record<string, unknown> };
  actionResults: Record<string, unknown>;
  startedAt: string;
};

export type AutomationRunStepViewModel = {
  id: string;
  runId: string;
  ordinal: number;
  actionId: string;
  actionType: string;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  approvalId?: string;
};

export type AutomationRunViewModel = {
  id: string;
  automationId: string;
  triggerType: string;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  taskId?: string;
  conversationId?: string;
  approvalId?: string;
  steps?: AutomationRunStepViewModel[];
};

export type AutomationViewModel = AutomationV2 & {
  status: AutomationStatus;
  triggerLabel: string;
  actionSummary: string;
};

export type AutomationCapability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";
export type AutomationPresetCategory = "productivity" | "email" | "calendar" | "filesystem" | "system" | "browser";
export type AutomationPreset = {
  id: string;
  version: number;
  category: AutomationPresetCategory;
  title: string;
  description: string;
  icon: string;
  requiredCapabilities: AutomationCapability[];
  automation: {
    name: string;
    description?: string;
    icon?: string;
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    conditionOperator?: AutomationConditionLogicalOperator;
    actions: AutomationAction[];
    output?: AutomationOutput;
    policy?: AutomationPolicy;
    prompt?: string;
  };
};

export type AutomationExecutionResult = {
  automationId: string;
  runId: string;
  conversationId: string;
  taskId: string;
};

export type CreateAutomationV2Input = Omit<AutomationV2, "id" | "version" | "createdAt" | "updatedAt" | "nextRunAt" | "lastRunAt" | "lastRunStatus" | "consecutiveFailures">;
export type UpdateAutomationV2Input = Partial<Omit<CreateAutomationV2Input, "enabled">> & { enabled?: boolean };

export const DEFAULT_AUTOMATION_POLICY: AutomationPolicy = {
  maxConcurrentRuns: 1,
  retries: { enabled: true, count: 2 },
  onRepeatedFailure: "pause"
};

/** Every automation run is presented as a dedicated Assistant conversation. */
export const DEFAULT_AUTOMATION_OUTPUT: AutomationOutput = { type: "chat", conversationMode: "automation" };
