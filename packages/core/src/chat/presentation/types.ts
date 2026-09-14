import { z } from "zod";
import type { ChatPresentation, ToolResult } from "@nexo/shared";

const actionState = z.enum(["idle", "preparing", "awaiting_approval", "executing", "success", "failed"]);
const action = z.object({
  id: z.string(), icon: z.enum(["reply", "archive", "trash", "open", "edit", "move", "download", "read", "unread", "more", "preview", "copy", "search", "list", "rsvp"]),
  label: z.string(), mutation: z.boolean(), disabled: z.boolean().optional(),
});
const resource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), messageId: z.string(), threadId: z.string().optional(), subject: z.string(), sender: z.object({ name: z.string().optional(), email: z.string() }), receivedAt: z.string(), snippet: z.string().optional(), unread: z.boolean().optional(), hasAttachments: z.boolean().optional(), bodyText: z.string().optional(), attachments: z.array(z.object({ id: z.string(), name: z.string(), contentType: z.string().optional(), size: z.number().optional() })).optional() }),
  ...(["file", "folder"] as const).map(kind => z.object({ kind: z.literal(kind), path: z.string(), name: z.string(), extension: z.string().optional(), size: z.number().optional(), modifiedAt: z.string().optional(), childCount: z.number().optional() })),
  z.object({ kind: z.literal("calendar"), eventId: z.string(), title: z.string(), start: z.string(), end: z.string(), location: z.string().optional(), description: z.string().optional(), joinUrl: z.string().optional(), allDay: z.boolean().optional() }),
  z.object({ kind: z.literal("generic"), title: z.string(), subtitle: z.string().optional(), description: z.string().optional(), metadata: z.array(z.object({ label: z.string(), value: z.string() })).optional(), badges: z.array(z.string()).optional() }),
]);
const clarificationOption = z.object({ id:z.string(), label:z.string(), value:z.unknown(), description:z.string().optional(), icon:z.string().optional() });
const clarificationQuestion = z.object({ id:z.string(), field:z.string(), prompt:z.string(), type:z.enum(["single_choice","multi_choice","text","choice_or_text"]), options:z.array(clarificationOption).optional(), suggestedOptionId:z.string().optional(), allowCustomValue:z.boolean().optional(), customPlaceholder:z.string().optional(), required:z.boolean() });
const base = { id: z.string(), version: z.literal(1) };
export const presentationSchema = z.object({ version: z.literal(1), blocks: z.array(z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), content: z.string() }),
  z.object({ ...base, type: z.literal("resource_collection"), domain: z.enum(["email", "filesystem", "calendar", "browser", "system", "generic"]), title: z.string(), subtitle: z.string().optional(), total: z.number().optional(), items: z.array(z.object({ id: z.string(), resource, actions: z.array(action), state: actionState.optional(), statusText: z.string().optional(), pendingApprovalId: z.string().optional() })), pagination: z.object({ hasMore: z.boolean(), cursor: z.string().optional() }).optional() }),
  z.object({ ...base, type: z.literal("approval"), approvalId: z.string(), title: z.string(), preview: z.string().optional(), consequence: z.string().optional(), affectedCount: z.number().optional(), expiresAt: z.string().optional(), status: z.enum(["pending", "approved", "rejected", "expired"]) }),
  z.object({ ...base, type:z.literal("clarification"), clarificationId:z.string(), title:z.string(), questions:z.array(clarificationQuestion), state:z.enum(["pending","submitted","cancelled","expired"]), values:z.record(z.unknown()).optional() }),
  z.object({ ...base, type: z.literal("status"), state: actionState, text: z.string() }),
])) });

/** Stored only in Core; never included in renderer messages. */
export type ResourceBinding = { blockId: string; itemId: string; toolName: string; input: Record<string, unknown> };
export const resourceBindingsSchema = z.array(z.object({ blockId: z.string(), itemId: z.string(), toolName: z.string(), input: z.record(z.unknown()) }));
export type PresentationRecord = { presentation: ChatPresentation; bindings: ResourceBinding[] };
export type PresentationContext = { toolName: string; input: Record<string, unknown> };
export type PresentationAdapter = (result: ToolResult, context: PresentationContext) => PresentationRecord | undefined;

export function parsePresentation(value: unknown): ChatPresentation | undefined {
  const parsed = presentationSchema.safeParse(value);
  return parsed.success ? parsed.data as ChatPresentation : undefined;
}
