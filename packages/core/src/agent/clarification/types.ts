import type { ClarificationQuestion,ClarificationResolution } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";

export type PendingClarification = {
  id: string;
  conversationId: string;
  domain: "filesystem" | "email" | "calendar" | "document" | "browser" | "system" | "memory" | "general";
  intent: string;
  operation: string;
  originalRequest: string;
  partialEntities: Record<string, unknown>;
  questions: ClarificationQuestion[];
  status: "pending" | "resolved" | "cancelled" | "expired";
  createdAt: string;
  resolvedAt?: string;
  expiresAt?: string;
  intentSnapshot: AgentIntent;
  values: Record<string, unknown>;
};

export type ClarificationResume = {
  pending: PendingClarification;
  intent: AgentIntent;
  originalRequest: string;
  resolution: ClarificationResolution;
};

export type ClarificationAttempt =
  | { kind: "none" }
  | { kind: "pending"; pending: PendingClarification; message?: string }
  | { kind: "resolved"; value: ClarificationResume };
