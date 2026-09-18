export { intentDomainSchema, type IntentDomain } from "./schemas/domain-v1.js";
export { intentNameSchema, agentIntentV1Schema as agentIntentSchema, type IntentName, type AgentIntentV1 as AgentIntent } from "./schemas/intent-v1.js";

import type { AgentIntentV1 } from "./schemas/intent-v1.js";

export type ApprovalPlanMetadata = {
  domain?: string;
  actionType?: string;
  preview?: string;
  affectedCount?: number;
  consequence?: string;
  expiresInMs?: number;
};

export type DeferredAction =
  | {
      kind: "email.bulk";
      action: "trash" | "archive" | "mark_read" | "mark_unread";
      sender?: string;
      subject?: string;
      receivedAt?: string;
      messageId?: string;
      allowMultiple?: boolean;
      selection?: AgentIntentV1["reference"];
    }
  | {
      kind: "calendar.delete";
      query?: string;
    }
  | {
      kind: "calendar.update";
      query?: string;
      patch: Record<string, unknown>;
    }
  | {
      kind: "filesystem.trash";
      path: string;
    }
  | {
      kind: "filesystem.write_text";
      fileName: string;
      content: string;
      root?: string;
    };

export type OrchestrationContext = {
  conversationId?: string;
  previous?: import("../context/conversation-action-context.js").ConversationActionContextState;
  learnedExamples?: Array<{ utterance: string; intent: AgentIntentV1; score?: number; source?: string }>;
};
