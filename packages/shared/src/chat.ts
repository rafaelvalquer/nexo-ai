import type { BrowserRunBlock } from "./browser-agent.js";
/** Core-produced presentation data. Provider credentials and tool inputs never belong here. */
export type ResourceActionState = "idle" | "preparing" | "awaiting_approval" | "executing" | "success" | "failed";
export type ResourceAction = {
  id: string;
  icon: "reply" | "archive" | "trash" | "open" | "edit" | "move" | "download" | "read" | "unread" | "more" | "preview" | "copy" | "search" | "list" | "rsvp";
  label: string;
  mutation: boolean;
  disabled?: boolean;
};
export type EmailResource = {
  kind: "email"; messageId: string; threadId?: string; subject: string;
  sender: { name?: string; email: string }; receivedAt: string;
  snippet?: string; unread?: boolean; hasAttachments?: boolean;
  bodyText?: string; attachments?: { id: string; name: string; contentType?: string; size?: number }[];
};
export type FileResource = {
  kind: "file" | "folder"; path: string; name: string; extension?: string;
  size?: number; modifiedAt?: string; childCount?: number;
};
export type CalendarResource = {
  kind: "calendar"; eventId: string; title: string; start: string; end: string;
  location?: string; description?: string; joinUrl?: string; allDay?: boolean;
};
export type GenericResource = {
  kind: "generic"; title: string; subtitle?: string; description?: string;
  metadata?: { label: string; value: string }[]; badges?: string[];
};
export type ResourceItem = {
  id: string; resource: EmailResource | FileResource | CalendarResource | GenericResource;
  actions: ResourceAction[];
  state?: ResourceActionState; statusText?: string; pendingApprovalId?: string;
};
type ChatBlockBase = { id: string; version: 1 };
export type TextBlock = ChatBlockBase & { type: "text"; content: string };
export type ResourceCollectionBlock = ChatBlockBase & {
  type: "resource_collection";
  domain: "email" | "filesystem" | "calendar" | "browser" | "system" | "generic";
  title: string; subtitle?: string; total?: number; items: ResourceItem[];
  pagination?: { hasMore: boolean; cursor?: string };
};
export type ApprovalBlock = ChatBlockBase & {
  type: "approval"; approvalId: string; title: string; preview?: string;
  consequence?: string; affectedCount?: number; expiresAt?: string;
  status: "pending" | "approved" | "rejected" | "expired";
};
export type ClarificationOption = {
  id: string; label: string; value: unknown; description?: string; icon?: string;
};
export type ClarificationQuestion = {
  id: string; field: string; prompt: string;
  type: "single_choice" | "multi_choice" | "text" | "choice_or_text" | "email" | "textarea";
  options?: ClarificationOption[]; suggestedOptionId?: string; selectedOptionIds?: string[];
  allowCustomValue?: boolean; customPlaceholder?: string; required: boolean;
  helperText?: string; submitLabel?: string;
};
export type ClarificationBlock = ChatBlockBase & {
  type: "clarification"; clarificationId: string; title: string;
  questions: ClarificationQuestion[];
  state: "pending" | "submitted" | "cancelled" | "expired";
  values?: Record<string, unknown>;
};
export type ClarificationResolutionRequest = {
  clarificationId: string; questionId: string; optionId?: string; optionIds?: string[]; customValue?: string;
  source?: "button" | "custom_input";
};
export type ClarificationResolution = {
  clarificationId: string; values: Record<string, unknown>;
  source: "button" | "custom_input" | "chat_text";
  status: "pending" | "resolved" | "cancelled" | "expired";
};
export type EmailComposeDraftStatus = "review" | "waiting_approval" | "sending" | "sent" | "cancelled";
export type EmailComposeDraftSnapshot = {
  id: string;
  conversationId: string;
  taskId?: string;
  connectionId?: string;
  to: string[];
  subject: string;
  bodyText: string;
  version: number;
  status: EmailComposeDraftStatus;
  approvalId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};
export type EmailComposeDraftPatch = { to?: string[]; subject?: string; bodyText?: string };
export type EmailComposeDraftUpdateRequest = { draftId: string; expectedVersion: number; patch: EmailComposeDraftPatch };
export type EmailComposeDraftSubmitRequest = { draftId: string; expectedVersion: number };
export type EmailComposeDraftCancelRequest = { draftId: string; expectedVersion: number };
export type EmailComposeReviewBlock = ChatBlockBase & {
  type: "email_compose_review";
  draftId: string;
  approvalId?: string;
  status: "review" | "sending" | "sent" | "cancelled" | "expired";
  fields: { to: string[]; subject: string; bodyText: string };
  error?: string;
  sentAt?: string;
  expiresAt?: string;
};
export type StatusBlock = ChatBlockBase & {
  type: "status"; state: ResourceActionState; text: string;
};
export type ChatBlock = TextBlock | ResourceCollectionBlock | ApprovalBlock | ClarificationBlock | EmailComposeReviewBlock | StatusBlock;
export type ChatPresentation = { version: 1; blocks: ChatBlock[] };
export type ChatActionRequest = {
  conversationId: string; messageId: string; blockId: string; itemId: string; actionId: string;
  itemIds?: string[];
  values?: { bodyText?: string; newName?: string; destination?: string; query?: string; title?: string; start?: string; end?: string; location?: string; response?: "accept" | "tentative" | "decline" };
};
export type ChatActionOutcome = { item?: ResourceItem; approval?: ApprovalBlock; text?: string; openPath?: string; openUrl?: string; copyText?: string; preview?: { kind: "text" | "image" | "pdf"; content: string }; block?: ResourceCollectionBlock };
export type ChatResourceUpdatedEvent = {
  type: "chat.resource.updated"; conversationId: string; messageId: string;
  blockId: string; itemId: string; state: ResourceActionState; item: ResourceItem;
  approval?: ApprovalBlock;
};
