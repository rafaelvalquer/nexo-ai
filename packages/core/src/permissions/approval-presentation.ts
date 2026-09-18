import type { RiskLevel } from "@nexo/shared";
import type { ApprovalMetadata } from "./approvals.js";

export type ApprovalPresentation = { title: string; metadata: ApprovalMetadata };

export function defaultApprovalPresentation(toolName: string, input: Record<string, unknown>, risk: RiskLevel): ApprovalPresentation {
  const affectedCount = Array.isArray(input.messageIds) ? input.messageIds.length : 1;
  const expiresInMs = risk === "CRITICAL" ? 5 * 60_000 : 10 * 60_000;

  if (toolName === "write_text_file") {
    const target = typeof input.path === "string" ? input.path.trim() : "";
    const details = filesystemTargetDetails(target);
    const content = typeof input.content === "string" ? input.content : "";
    return {
      title: `Alterar arquivo ${details.name || "(sem nome)"}`,
      metadata: {
        domain: "filesystem",
        actionType: "update",
        affectedCount: 1,
        preview: [
          `Nome: ${details.name || "(não informado)"}`,
          details.parent ? `Local: ${details.parent}` : undefined,
          target ? `Caminho: ${target}` : undefined,
          `Novo conteúdo:\n${content.length <= 1000 ? content : content.slice(0, 1000) + "\n…"}`
        ].filter(Boolean).join("\n"),
        consequence: "O conteúdo atual do arquivo será substituído pelo novo conteúdo informado.",
        expiresInMs
      }
    };
  }

  if (toolName === "create_text_file" || toolName === "create_folder") {
    const target = typeof input.path === "string" ? input.path.trim() : "";
    const details = filesystemTargetDetails(target);
    const isFile = toolName === "create_text_file";
    const resourceLabel = isFile ? "arquivo" : "pasta";
    return {
      title: `Criar ${resourceLabel} ${details.name || "(sem nome)"}`,
      metadata: {
        domain: "filesystem",
        actionType: "create",
        affectedCount: 1,
        preview: [
          `Nome: ${details.name || "(não informado)"}`,
          details.parent ? `Local: ${details.parent}` : undefined,
          target ? `Caminho: ${target}` : undefined
        ].filter(Boolean).join("\n"),
        consequence: isFile
          ? "Um novo arquivo será criado. Arquivos existentes não serão sobrescritos."
          : "Uma nova pasta será criada no caminho informado.",
        expiresInMs
      }
    };
  }

  if (toolName.startsWith("email_send")) {
    const message = isRecord(input.message) ? input.message : input;
    const recipients = Array.isArray(message.to) ? message.to.map(recipientLabel).filter(Boolean) : [];
    const subject = typeof message.subject === "string" && message.subject.trim() ? message.subject : "(sem assunto)";
    const body = typeof message.bodyText === "string" ? message.bodyText : "";
    return {
      title: recipients.length === 1 ? `Enviar e-mail para ${recipients[0]}` : `Enviar e-mail para ${recipients.length || 1} destinatário(s)`,
      metadata: {
        domain: "email",
        actionType: "send",
        affectedCount: Math.max(recipients.length, 1),
        preview: [`Para: ${recipients.join(", ") || "(não informado)"}`, `Assunto: ${subject}`, body ? `Mensagem:\n${body}` : undefined].filter(Boolean).join("\n"),
        consequence: "O e-mail será enviado em seu nome.",
        expiresInMs
      }
    };
  }

  if (/^email_(bulk_)?(trash|archive|mark_read|mark_unread)$/.test(toolName)) {
    const action = toolName.includes("trash") ? "Mover para a lixeira" : toolName.includes("archive") ? "Arquivar" : toolName.includes("mark_unread") ? "Marcar como não lido" : "Marcar como lido";
    const ids = Array.isArray(input.messageIds) ? input.messageIds.map(String) : typeof input.messageId === "string" ? [input.messageId] : [];
    return {
      title: affectedCount > 1 ? `${action} ${affectedCount} e-mails` : `${action} e-mail`,
      metadata: {
        domain: "email",
        actionType: toolName.replace(/^email_(?:bulk_)?/, ""),
        affectedCount,
        preview: ids.length ? `${affectedCount > 1 ? "Mensagens" : "Mensagem"}:\n${ids.join("\n")}` : `${affectedCount} e-mail(s) serão afetados.`,
        consequence: `${affectedCount} e-mail(s) serão alterados na conta conectada.`,
        expiresInMs
      }
    };
  }

  if (toolName.startsWith("calendar_")) {
    const title = typeof input.title === "string" && input.title.trim() ? input.title : typeof input.eventId === "string" ? input.eventId : "evento selecionado";
    return {
      title: `Confirmar alteração na agenda`,
      metadata: {
        domain: "calendar",
        actionType: toolName.replace(/^calendar_/, ""),
        affectedCount: 1,
        preview: [title, input.start, input.end, input.location].filter(value => typeof value === "string" && value).join("\n"),
        consequence: "Esta ação alterará sua agenda conectada.",
        expiresInMs
      }
    };
  }

  const paths = [input.path, input.source, input.destination].filter(value => typeof value === "string") as string[];
  return {
    title: humanizeToolName(toolName),
    metadata: {
      domain: toolName.split("_")[0],
      actionType: toolName.replace(/^[^_]+_/, ""),
      affectedCount: 1,
      preview: paths.length ? paths.join("\n") : undefined,
      consequence: "Esta ação alterará dados e só será executada após sua confirmação.",
      expiresInMs
    }
  };
}

export function isGenericApprovalReason(reason: string) {
  return reason === "A ação proposta pelo agente altera estado e requer sua confirmação." || reason === "Ação requer aprovação";
}

function recipientLabel(value: unknown) {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.email === "string") return value.name ? `${String(value.name)} <${value.email}>` : value.email;
  return "";
}
function humanizeToolName(name: string) { return name.replace(/_/g, " ").replace(/^./, value => value.toUpperCase()); }
function filesystemTargetDetails(target: string) {
  const normalized = target.replace(/[\\/]+$/, "");
  if (!normalized) return { name: "", parent: "" };
  const separator = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return {
    name: separator >= 0 ? normalized.slice(separator + 1) : normalized,
    parent: separator > 0 ? normalized.slice(0, separator) : separator === 0 ? normalized.slice(0, 1) : ""
  };
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
