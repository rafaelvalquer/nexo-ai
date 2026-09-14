import type { AutomationAction, AutomationExecutionContext } from "@nexo/shared";
import { resolveField } from "../conditions/evaluator.js";

export type AutomationActionExecution = { value: unknown; approvalId?: string };

const MUTATING_ACTIONS = new Set(["email.mark_read", "email.archive", "filesystem.move"]);

/** Structured actions are translated into deterministic agent requests so all writes still cross PermissionEngine/ApprovalService. */
export class AutomationActionExecutor {
  constructor(private executeCommand: (command: string) => Promise<unknown>) {}

  async execute(action: AutomationAction, context: AutomationExecutionContext): Promise<AutomationActionExecution> {
    const config = resolveConfig(action.config, context);
    if (action.type === "notification.show") {
      const title = displayText(config.title) || "Automação concluída";
      const content = displayText(config.content);
      return { value: { ok:true, summary:content ? `${title}: ${content}` : title, notification:{ title, content } } };
    }
    if (context.trigger.data.dryRun === true && MUTATING_ACTIONS.has(action.type)) {
      return { value: { ok:true, dryRun:true, summary:`Simulação: ${describeMutation(action.type,config)} Nenhuma alteração foi executada.` } };
    }
    const command = this.commandFor(action.type, config, context);
    const value = await this.executeCommand(command);
    return { value, approvalId:extractApprovalId(value) };
  }

  private commandFor(type: string, config: Record<string, unknown>, context: AutomationExecutionContext): string {
    if (type === "nexo.command") {
      const command = displayText(config.command).trim();
      if (!command) throw new Error("A ação não possui comando configurado.");
      if (context.trigger.data.dryRun === true) return `SIMULAÇÃO. Não execute mutações. Explique o que faria para atender: ${command}`;
      return command;
    }
    const trigger = context.trigger.data;
    const messageId = displayText(config.messageId) || displayText(resolveLoose(trigger,"message.id")) || displayText(resolveLoose(trigger,"email.id"));
    const connectionId = displayText(config.connectionId) || displayText(resolveLoose(trigger,"connectionId"));
    if (type === "email.summary") return `Resuma de forma objetiva o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` usando a conexão ${connectionId}` : ""}. Não altere a mensagem.`;
    if (type === "email.mark_read") return `Marque como lido o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` na conexão ${connectionId}` : ""}.`;
    if (type === "email.archive") return `Arquive o e-mail${messageId ? ` de ID ${messageId}` : " recebido pela automação"}${connectionId ? ` na conexão ${connectionId}` : ""}.`;
    if (type === "calendar.summary") {
      const period = displayText(config.period) || "today";
      const label = period === "tomorrow" ? "amanhã" : period === "week" ? "dos próximos 7 dias" : "de hoje";
      return `Liste e resuma minha agenda ${label}. Destaque horários, participantes e links de reunião quando existirem.`;
    }
    if (type === "filesystem.list") return `Liste os arquivos da pasta ${quote(displayText(config.path))}. Não altere nenhum arquivo.`;
    if (type === "filesystem.move") return `Mova o arquivo ${quote(displayText(config.source))} para ${quote(displayText(config.destination))}.`;
    if (type === "system.snapshot") return "Mostre um resumo do computador com uso de disco, memória e principais processos. Não altere o sistema.";
    if (type === "browser.open") return `Abra no navegador a URL ${quote(displayText(config.url))}.`;
    if (type === "browser.extract") return `Acesse ${quote(displayText(config.url))}, extraia o conteúdo principal e retorne somente o conteúdo relevante. Não faça alterações na página.`;
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
function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    const record=value as Record<string,unknown>;
    for (const key of ["summary","text","content","output"]) if (typeof record[key] === "string") return record[key] as string;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}
function describeMutation(type:string,config:Record<string,unknown>):string {
  if(type==="email.mark_read")return"marcaria a mensagem como lida.";
  if(type==="email.archive")return"arquivaria a mensagem selecionada.";
  if(type==="filesystem.move")return`moveria ${displayText(config.source)||"o arquivo"} para ${displayText(config.destination)||"o destino configurado"}.`;
  return`executaria ${type}.`;
}
function quote(value:string):string { if(!value)throw new Error("A ação está sem um campo obrigatório.");return JSON.stringify(value); }
function serialize(value:unknown):string { return typeof value==="string"?value:JSON.stringify(value,null,2); }
