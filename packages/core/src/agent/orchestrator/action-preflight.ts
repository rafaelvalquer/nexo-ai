import path from "node:path";
import type { ToolResult } from "@nexo/shared";
import type { DeferredAction } from "./intent-schema.js";
import type { BuiltPlanStep } from "./plan-builder.js";

export type MaterializedAction = { step?: BuiltPlanStep; direct?: string };

export function materializeDeferredAction(action: DeferredAction, result: ToolResult): MaterializedAction {
  if (!result.ok) return { direct: typeof result.error === "string" ? result.error : result.error?.message ?? result.summary };
  if (action.kind === "email.bulk") return materializeEmail(action, result.data);
  if (action.kind === "calendar.delete") return materializeCalendarDelete(action, result.data);
  if (action.kind === "calendar.update") return materializeCalendarUpdate(action, result.data);
  return materializeFilesystemTrash(action, result.data);
}

function materializeEmail(action: Extract<DeferredAction, { kind: "email.bulk" }>, data: unknown): MaterializedAction {
  const messages = Array.isArray((data as any)?.messages) ? (data as any).messages as any[] : Array.isArray(data) ? data : [];
  let selected = messages.filter(message => message?.id);
  if (action.messageId) selected = selected.filter(message => message.id === action.messageId);
  if (action.subject) selected = selected.filter(message => String(message.subject ?? "").trim().toLocaleLowerCase() === action.subject!.trim().toLocaleLowerCase());
  if (action.sender) {
    const sender = action.sender.toLowerCase();
    selected = selected.filter(message => sender.includes("@") ? String(message.from?.email ?? "").toLowerCase() === sender : String(message.from?.name ?? message.from?.email ?? "").toLowerCase().includes(sender));
  }
  if (action.receivedAt) { const date = Date.parse(action.receivedAt); selected = selected.filter(message => Number.isFinite(date) && Math.floor(Date.parse(message.receivedAt)/60000) === Math.floor(date/60000)); }
  if (!selected.length) return { direct: "Nenhum e-mail encontrado corresponde exatamente ao filtro informado. Nenhuma alteração foi executada." };
  if (selected.length > 1 && !action.allowMultiple) return { direct: `Encontrei ${selected.length} e-mails que correspondem ao pedido. Escolha nos cards qual deles deseja alterar. Nenhuma alteração foi executada.` };
  const ids = selected.map(message => String(message.id));
  const tool = `${ids.length === 1 ? "email_" : "email_bulk_"}${action.action}`;
  const verb = action.action === "trash" ? "movidos para a lixeira" : action.action === "archive" ? "arquivados" : action.action === "mark_read" ? "marcados como lidos" : "marcados como não lidos";
  const preview = selected.slice(0, 8).map((message, index) => `${index + 1}. ${message.subject ?? "(sem assunto)"} — ${message.from?.email ?? message.from?.name ?? "remetente desconhecido"}`).join("\n");
  return {
    step: {
      tool,
      input: ids.length === 1 ? { messageId: ids[0] } : { messageIds: ids },
      explanation: `Aguardando confirmação para alterar ${ids.length} e-mail(s)…`,
      approval: {
        domain: "email",
        actionType: action.action,
        affectedCount: ids.length,
        preview: `${ids.length} e-mail(s) selecionado(s):\n${preview}${ids.length > 8 ? `\n… e mais ${ids.length - 8}.` : ""}`,
        consequence: `${ids.length} e-mail(s) serão ${verb}.`,
        expiresInMs: action.action === "trash" ? 5 * 60_000 : 10 * 60_000
      }
    }
  };
}

function materializeCalendarDelete(action: Extract<DeferredAction, { kind: "calendar.delete" }>, data: unknown): MaterializedAction {
  const events = Array.isArray(data) ? data as any[] : [];
  if (!events.length) return { direct: "Nenhum compromisso corresponde ao pedido. Nada foi cancelado." };
  if (events.length > 1) return { direct: ambiguity(events) };
  const event = events[0];
  return {
    step: {
      tool: "calendar_delete",
      input: { eventId: String(event.id) },
      explanation: "Aguardando confirmação para cancelar o compromisso…",
      approval: {
        domain: "calendar", actionType: "delete", affectedCount: 1,
        preview: eventPreview(event), consequence: "O compromisso será cancelado.", expiresInMs: 5 * 60_000
      }
    }
  };
}

function materializeCalendarUpdate(action: Extract<DeferredAction, { kind: "calendar.update" }>, data: unknown): MaterializedAction {
  const events = Array.isArray(data) ? data as any[] : [];
  if (!events.length) return { direct: "Nenhum compromisso corresponde ao pedido. Nada foi alterado." };
  if (events.length > 1) return { direct: ambiguity(events) };
  if (!Object.keys(action.patch).length) return { direct: "Encontrei o compromisso, mas não ficou claro o que deve ser alterado." };
  const event = events[0];
  return {
    step: {
      tool: "calendar_update",
      input: { eventId: String(event.id), ...action.patch },
      explanation: "Aguardando confirmação para alterar o compromisso…",
      approval: {
        domain: "calendar", actionType: "update", affectedCount: 1,
        preview: `${eventPreview(event)}\nAlterações: ${JSON.stringify(action.patch)}`,
        consequence: "O compromisso será atualizado.", expiresInMs: 10 * 60_000
      }
    }
  };
}

function materializeFilesystemTrash(action: Extract<DeferredAction, { kind: "filesystem.trash" }>, data: unknown): MaterializedAction {
  const info = data && typeof data === "object" ? data as { size?: number; isDirectory?: boolean } : {};
  const name = path.basename(action.path);
  const kind = info.isDirectory ? "pasta" : "arquivo";
  const size = typeof info.size === "number" && !info.isDirectory ? `\nTamanho: ${formatBytes(info.size)}` : "";
  return {
    step: {
      tool: "trash_file",
      input: { path: action.path },
      explanation: `Aguardando confirmação para mover ${name} para a lixeira…`,
      approval: {
        domain: "filesystem",
        actionType: "trash",
        affectedCount: 1,
        preview: `${kind[0].toUpperCase()}${kind.slice(1)}: ${name}\nCaminho: ${action.path}${size}`,
        consequence: `O ${kind} será movido para a lixeira do sistema.`,
        expiresInMs: 5 * 60_000
      }
    }
  };
}

function ambiguity(events: any[]) {
  const list = events.slice(0, 10).map((event, index) => `${index + 1}. ${event.title ?? "(sem título)"}${event.start ? ` — ${new Date(event.start).toLocaleString("pt-BR")}` : ""}`).join("\n");
  return `Encontrei ${events.length} compromissos possíveis. Para evitar alterar o evento errado, escolha um deles:\n${list}`;
}
function eventPreview(event: any) { return `${event.title ?? "(sem título)"}${event.start ? `\n${new Date(event.start).toLocaleString("pt-BR")}` : ""}`; }
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}
