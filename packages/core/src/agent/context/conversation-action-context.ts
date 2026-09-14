import type { ToolResult } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";
import type { PlanStep } from "../planner.js";

export type ActionContextEmail = {
  id: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
  snippet?: string;
};

export type ActionContextCalendar = {
  id: string;
  title?: string;
  start?: string;
  end?: string;
};

export type ConversationActionContextState = {
  updatedAt: string;
  lastDomain?: AgentIntent["domain"];
  lastIntent?: AgentIntent["intent"];
  lastTool?: string;
  lastQuery?: string;
  emails?: ActionContextEmail[];
  events?: ActionContextCalendar[];
};

export function observeConversationActionContext(
  previous: ConversationActionContextState | undefined,
  userRequest: string,
  intent: AgentIntent | undefined,
  step: PlanStep,
  result: ToolResult
): ConversationActionContextState {
  const next: ConversationActionContextState = {
    ...(previous ?? { updatedAt: new Date().toISOString() }),
    updatedAt: new Date().toISOString(),
    lastDomain: intent?.domain ?? previous?.lastDomain,
    lastIntent: intent?.intent ?? previous?.lastIntent,
    lastTool: step.tool,
    lastQuery: userRequest
  };

  if (!result.ok) return next;
  if (step.tool.startsWith("email_")) {
    const data = result.data as any;
    const messages = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : data?.id ? [data] : [];
    const normalized = messages
      .filter((item: any) => item?.id)
      .slice(0, 50)
      .map((item: any) => ({
        id: String(item.id),
        from: String(item.from?.email ?? item.from?.name ?? "") || undefined,
        subject: typeof item.subject === "string" ? item.subject : undefined,
        receivedAt: typeof item.receivedAt === "string" ? item.receivedAt : undefined,
        snippet: typeof item.snippet === "string" ? item.snippet.slice(0, 600) : undefined
      }));
    if (normalized.length) next.emails = normalized;
  }

  if (step.tool.startsWith("calendar_")) {
    const data = result.data as any;
    const events = Array.isArray(data) ? data : data?.id ? [data] : [];
    const normalized = events
      .filter((item: any) => item?.id)
      .slice(0, 50)
      .map((item: any) => ({
        id: String(item.id),
        title: typeof item.title === "string" ? item.title : undefined,
        start: typeof item.start === "string" ? item.start : undefined,
        end: typeof item.end === "string" ? item.end : undefined
      }));
    if (normalized.length) next.events = normalized;
  }

  return next;
}

export function selectedPreviousEmailIds(state: ConversationActionContextState | undefined, selection?: AgentIntent["reference"]) {
  let rows = state?.emails ?? [];
  if (!selection?.selection || selection.selection.type === "all") return rows.map(row => row.id);
  if (selection.selection.type === "first") return rows.slice(0, selection.selection.count ?? 1).map(row => row.id);
  const indices = new Set(selection.selection.indices ?? []);
  return rows.filter((_row, index) => indices.has(index + 1)).map(row => row.id);
}

export function selectedPreviousEventIds(state: ConversationActionContextState | undefined, selection?: AgentIntent["reference"]) {
  let rows = state?.events ?? [];
  if (!selection?.selection || selection.selection.type === "all") return rows.map(row => row.id);
  if (selection.selection.type === "first") return rows.slice(0, selection.selection.count ?? 1).map(row => row.id);
  const indices = new Set(selection.selection.indices ?? []);
  return rows.filter((_row, index) => indices.has(index + 1)).map(row => row.id);
}
