import { z } from "zod";

export const intentDomainSchema = z.enum(["email", "calendar", "filesystem", "browser", "system", "memory", "general"]);
export const intentNameSchema = z.enum(["list", "search", "read", "summarize", "stats", "create", "send", "update", "delete", "move", "answer", "help"]);

const referenceSchema = z.object({
  source: z.literal("previous_result").default("previous_result"),
  selection: z.object({
    type: z.enum(["all", "first", "indices"]),
    count: z.number().int().min(1).max(100).optional(),
    indices: z.array(z.number().int().min(1)).max(100).optional()
  }).default({ type: "all" })
}).optional();

export const agentIntentSchema = z.object({
  status: z.enum(["ready", "needs_clarification"]).default("ready"),
  domain: intentDomainSchema,
  intent: intentNameSchema,
  operation: z.string().min(1),
  entities: z.record(z.unknown()).default({}),
  referencesPreviousResult: z.boolean().default(false),
  reference: referenceSchema,
  requiresDataLookup: z.boolean().default(false),
  requiresConfirmation: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  missing: z.array(z.string()).optional(),
  question: z.string().optional()
});

export type AgentIntent = z.infer<typeof agentIntentSchema>;
export type IntentDomain = z.infer<typeof intentDomainSchema>;
export type IntentName = z.infer<typeof intentNameSchema>;

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
      selection?: AgentIntent["reference"];
    }
  | {
      kind: "calendar.delete";
      query?: string;
    }
  | {
      kind: "calendar.update";
      query?: string;
      patch: Record<string, unknown>;
    };

export type OrchestrationContext = {
  conversationId?: string;
  previous?: import("../context/conversation-action-context.js").ConversationActionContextState;
};
