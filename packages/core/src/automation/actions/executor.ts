import type { AutomationAction, AutomationExecutionContext } from "@nexo/shared";
import { resolveField } from "../conditions/evaluator.js";

export type AutomationActionExecution = { value: unknown; approvalId?: string };

/** Structured actions are translated into deterministic agent requests so all writes still cross PermissionEngine/ApprovalService. */
export class AutomationActionExecutor {
  constructor(private executeCommand: (command: string) => Promise<unknown>) {}

  async execute(action: AutomationAction, context: AutomationExecutionContext): Promise<AutomationActionExecution> {
    const config = resolveConfig(action.config, context);
    if (action.type === "notification.show") {
      const title = text(config.title) || "Automação concluída";
      const content = text(config.content);
      return { value: { ok:true, summary:content ? `${title}: ${content}` : title, notification:{ title, content } } };
    }
    const command = this.commandFor(action.type, config, context);
    const value = await this.executeCommand(command);
    return { value, approvalId:extractApprovalId(value) };
  }

  private commandFor(type: string, config: Record<string, unknown>, context: AutomationExecutionContext): string {
    if (type === "nexo.command") {
      const command = text(config.command).trim();
      if (!command) throw new Error("A ação não possui comando configurado.");
      return command;
    }
    const trigger = context.trigger.data;
    const messageId = text(config.messageId) || text(resolveLoose(trigger,"message.id")) || text(resolveLoose(trigger,"email.id"));
    const connectionId = text(config.connectionId) || text(resolveLoose(trigger,"connectionId"));
    if (type === "email.summary") return `Resuma de forma objetiva o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` usando a conexão ${connectionId}` : ""}. Não altere a mensagem.`;
    if (type === "email.mark_read") return `Marque como lido o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` na conexão ${connectionId}` : ""}.`;
    if (type === "email.archive") return `Arquive o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` na conexão ${connectionId}` : ""}.`;
    if (type === "calendar.summary") {
      const period = text(config.period) || "today";
      const label = period === "tomorrow" ? "amanhã" : period === "week" ? "dos próximos 7 dias" : "de hoje";
      return `Liste e resuma minha agenda ${label}. Destaque horários, participantes e links de reunião quando existirem.`;
    }
    if (type === "filesystem.list") return `Liste os arquivos da pasta ${quote(text(config.path))}. Não altere nenhum arquivo.`;
    if (type === "filesystem.move") return `Mova o arquivo ${quote(text(config.source))} para ${quote(text(config.destination))}.`;
    if (type === "system.snapshot") return "Mostre um resumo do computador com uso de disco, memória e principais processos. Não altere o sistema.";
    if (type === "browser.open") return `Abra no navegador a URL ${quote(text(config.url))}.`;
    if (type === "browser.extract") return `Acesse ${quote(text(config.url))}, extraia o conteúdo principal e retorne somente o conteúdo relevante. Não faça alterações na página.`;
    if (type === "ai.summarize") return `Resuma de forma objetiva o seguinte conteúdo:\n\n${serialize(config.source)}`;
    if (type === "ai.classify") return `Classifique o conteúdo a seguir e explique a classificação de forma curta:\n\n${serialize(config.source)}`;
    throw new Error(`Ação de automação não registrada: ${type}`);
  }
}

export function resolveConfig(config: Record<string, unknown>, context: AutomationExecutionContext): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([key,value])=>[key,resolveValue(value,context)]));
}
function resolveValue(value: unknown, context: AutomationExecutionContext): unknown {
  if (typeof value === "string" && value.startsWith("$")) return resolveField(value,context);
  if (Array.isArray(value)) return value.map(item=>resolveValue(item,context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,resolveValue(item,context)]));
  return value;
}
function extractApprovalId(value: unknown): string | undefined { if(!value||typeof value!=="object")return undefined;const approvalId=(value as Record<string,unknown>).approvalId;return typeof approvalId==="string"&&approvalId?approvalId:undefined; }
function resolveLoose(source: Record<string,unknown>, path: string): unknown { let current:unknown=source;for(const part of path.split(".")){if(!current||typeof current!=="object")return undefined;current=(current as Record<string,unknown>)[part];}return current; }
function text(value: unknown): string { return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value); }
function quote(value:string):string { if(!value)throw new Error("A ação está sem um campo obrigatório.");return JSON.stringify(value); }
function serialize(value:unknown):string { return typeof value==="string"?value:JSON.stringify(value,null,2); }
