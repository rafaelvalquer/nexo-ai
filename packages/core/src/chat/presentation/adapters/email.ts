import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ResourceAction, ResourceItem } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";

const messageSchema = z.object({
  id: z.string().min(1), threadId: z.string().optional(), subject: z.string(),
  from: z.object({ email: z.string(), name: z.string().optional() }), receivedAt: z.string(),
  snippet: z.string().optional(), bodyText: z.string().optional(), isUnread: z.boolean().optional(), hasAttachments: z.boolean().optional(),
});
const EMAIL_SEND_CAPABILITY = "email.send";
const EMAIL_MODIFY_CAPABILITY = "email.modify";

export function emailActions(unread?: boolean, capabilities?: string[]): ResourceAction[] {
  const hasCapabilitySnapshot=Array.isArray(capabilities);
  const canSend=!hasCapabilitySnapshot||capabilities.includes(EMAIL_SEND_CAPABILITY);
  const canModify=!hasCapabilitySnapshot||capabilities.includes(EMAIL_MODIFY_CAPABILITY);
  return [
    { id: "email.reply", icon: "reply", label: canSend ? "Responder" : "Responder — autorize ‘Enviar e-mails’ em Conexões", mutation: true, disabled: !canSend },
    { id: "email.archive", icon: "archive", label: canModify ? "Arquivar" : "Arquivar — autorize ‘Alterar e-mails’ em Conexões", mutation: true, disabled: !canModify },
    { id: unread ? "email.mark_read" : "email.mark_unread", icon: unread ? "read" : "unread", label: canModify ? (unread ? "Marcar como lido" : "Marcar como não lido") : "Alterar leitura — autorize ‘Alterar e-mails’ em Conexões", mutation: true, disabled: !canModify },
    { id: "email.trash", icon: "trash", label: canModify ? "Mover para a lixeira" : "Mover para a lixeira — autorize ‘Alterar e-mails’ em Conexões", mutation: true, disabled: !canModify },
    { id: "email.expand", icon: "more", label: "Ver mensagem e anexos", mutation: false },
  ];
}
export const emailAdapter: PresentationAdapter = (result, context) => {
  const page = z.object({ messages: z.array(z.unknown()), total: z.number().optional(), nextPageToken: z.string().optional() }).safeParse(result.data);
  const rows = page.success ? page.data.messages : Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
  const parsed = z.array(messageSchema).safeParse(rows);
  if (!parsed.success) return undefined;
  const blockId = randomUUID();
  const capabilities=Array.isArray(context.input.__connectionCapabilities)?context.input.__connectionCapabilities.filter((value):value is string=>typeof value==="string"):undefined;
  const items: ResourceItem[] = parsed.data.map(message => ({
    id: randomUUID(), resource: { kind: "email", messageId: message.id, threadId: message.threadId, subject: message.subject, sender: message.from, receivedAt: message.receivedAt, snippet: message.snippet, unread: message.isUnread, hasAttachments: message.hasAttachments, bodyText: message.bodyText },
    actions: typeof context.input.connectionId === "string" ? emailActions(message.isUnread,capabilities) : [],
  }));
  return {
    presentation: { version: 1, blocks: [{ id: blockId, version: 1, type: "resource_collection", domain: "email", title: context.input.unread ? "E-mails não lidos" : "E-mails encontrados", total: page.success ? page.data.total ?? items.length : items.length, items, pagination: { hasMore: Boolean(page.success && page.data.nextPageToken), cursor: page.success ? page.data.nextPageToken : undefined } }] },
    bindings: [...items.map(item => ({ blockId, itemId: item.id, toolName: context.toolName, input: { connectionId: context.input.connectionId, messageId: item.resource.kind === "email" ? item.resource.messageId : undefined } })), ...(context.toolName === "email_search" ? [{blockId,itemId:"__page__",toolName:context.toolName,input:{connectionId:context.input.connectionId,query:context.input.query,unread:context.input.unread,maxResults:context.input.maxResults}}] : [])],
  };
};
