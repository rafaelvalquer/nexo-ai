import type { ChatMessage } from "./index.js";

export type ConversationCursor = { conversationId: string; createdAt: string; id: string };
export type ConversationPageOptions = { limit?: number; before?: ConversationCursor };
export type ConversationMessagePage = { messages: ChatMessage[]; hasMore: boolean; nextCursor?: ConversationCursor };

/** Shared by IPC and Core so direct callers obey the same cursor contract. */
export function validateConversationPageOptions(conversationId: string, input: unknown = {}): ConversationPageOptions {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Paginação inválida.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["limit", "before"].includes(key))) throw new Error("Paginação inválida.");
  const limit = value.limit === undefined ? 50 : value.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Limite de mensagens inválido.");
  if (value.before === undefined) return { limit };
  const cursor = value.before as Partial<ConversationCursor>;
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)
    || Object.keys(cursor).some(key => !["conversationId", "createdAt", "id"].includes(key))
    || cursor.conversationId !== conversationId || typeof cursor.id !== "string" || !cursor.id.trim() || cursor.id.length > 200
    || typeof cursor.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt)
    || !Number.isFinite(Date.parse(cursor.createdAt)) || new Date(cursor.createdAt).toISOString() !== cursor.createdAt) throw new Error("Cursor de mensagens inválido.");
  return { limit, before: { conversationId, createdAt: cursor.createdAt, id: cursor.id } };
}
