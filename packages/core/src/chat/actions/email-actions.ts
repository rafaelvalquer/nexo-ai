import { z } from "zod";
import type { ChatActionRegistry } from "./registry.js";

export function registerEmailActions(registry: ChatActionRegistry) {
  for (const action of ["trash", "archive", "mark_read", "mark_unread"] as const) registry.register(`email.${action}`, ({request, items, binding}) => {
    const connectionId = z.string().min(1).parse(binding.input.connectionId);
    const messageIds = items.map(item => { if (item.resource.kind !== "email") throw new Error("Seleção não contém apenas e-mails."); return item.resource.messageId; });
    const tool = messageIds.length > 1 ? `email_bulk_${action}` : `email_${action}`;
    const successText = ({trash: "Movido para a lixeira", archive: "Arquivado", mark_read: "Marcado como lido", mark_unread: "Marcado como não lido"})[action];
    return { mutation: true, successText, steps: [{ tool, input: { connectionId, ...(messageIds.length > 1 ? {messageIds} : {messageId: messageIds[0]}) }, approval: {domain: "email", actionType: action, affectedCount: messageIds.length, preview: items.map(item => item.resource.kind === "email" ? `${item.resource.subject}\n${item.resource.sender.email}` : "").join("\n\n"), consequence: `${messageIds.length} e-mail(s): ${successText.toLowerCase()}.` } }] };
  });
  registry.register("email.reply", ({request, item, binding}) => {
    if (item.resource.kind !== "email") throw new Error("O recurso não é um e-mail.");
    const bodyText = z.string().trim().min(1).max(100000).parse(request.values?.bodyText);
    const connectionId = z.string().min(1).parse(binding.input.connectionId);
    const subject = /^re:/i.test(item.resource.subject) ? item.resource.subject : `Re: ${item.resource.subject}`;
    return { mutation: true, successText: "Resposta enviada", steps: [{ tool: "email_send_composed", input: {connectionId, to: [{email: item.resource.sender.email, name: item.resource.sender.name}], subject, bodyText}, approval: {domain: "email", actionType: "reply", affectedCount: 1, preview: `Para: ${item.resource.sender.email}\nAssunto: ${subject}\n\n${bodyText}`, consequence: "Esta resposta será enviada ao remetente."} }] };
  });
  registry.register("email.expand", ({item, binding}) => {
    if (item.resource.kind !== "email") throw new Error("O recurso não é um e-mail.");
    const input = {connectionId: z.string().min(1).parse(binding.input.connectionId), messageId: item.resource.messageId};
    return {mutation: false, mode: "expand", successText: "Mensagem carregada", steps: [{tool: "email_get", input}, ...(item.resource.hasAttachments ? [{tool: "email_list_attachments", input}] : [])]};
  });
}
