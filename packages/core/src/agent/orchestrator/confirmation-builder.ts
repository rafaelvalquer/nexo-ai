import type { ToolDefinition } from "../../tools/types.js";
import type { BuiltPlanStep } from "./plan-builder.js";

export type ConfirmationMetadata = {
  domain?: string;
  actionType?: string;
  preview?: string;
  affectedCount?: number;
  consequence?: string;
  expiresInMs?: number;
};

export function buildConfirmation(step: BuiltPlanStep, tool: ToolDefinition, input: Record<string, unknown>): ConfirmationMetadata {
  if (step.approval) return step.approval;
  const domain = tool.domain ?? domainFromName(tool.name);
  const actionType = tool.operation ?? tool.name;
  const affectedCount = Array.isArray(input.messageIds) ? input.messageIds.length : 1;
  const preview = defaultPreview(tool.name, input);
  return {
    domain,
    actionType,
    affectedCount,
    preview,
    consequence: `${tool.description}.`,
    expiresInMs: tool.risk === "CRITICAL" ? 5 * 60_000 : 10 * 60_000
  };
}

export function confirmationText(tool: ToolDefinition, meta: ConfirmationMetadata) {
  const lines = ["Preciso da sua confirmação antes de executar esta alteração."];
  if (meta.preview) lines.push("", meta.preview);
  if (meta.consequence) lines.push("", meta.consequence);
  lines.push("", `Ação: ${tool.description}`);
  return lines.join("\n");
}

function defaultPreview(name: string, input: Record<string, unknown>) {
  if (name.startsWith("email_send")) {
    const message = (input.message as any) ?? input;
    const to = Array.isArray(message.to) ? message.to.map((item: any) => item?.email ?? item).filter(Boolean).join(", ") : "";
    return `Para: ${to || "(não informado)"}\nAssunto: ${message.subject ?? "(sem assunto)"}\n\n${message.bodyText ?? ""}`.trim();
  }
  if (name.startsWith("calendar_")) {
    return [input.title, input.start, input.end].filter(Boolean).join("\n") || `Evento: ${String(input.eventId ?? "")}`;
  }
  if (Array.isArray(input.messageIds)) return `${input.messageIds.length} e-mail(s) serão afetados.`;
  return undefined;
}
function domainFromName(name: string) { return name.startsWith("email_") ? "email" : name.startsWith("calendar_") ? "calendar" : name.split("_")[0]; }
