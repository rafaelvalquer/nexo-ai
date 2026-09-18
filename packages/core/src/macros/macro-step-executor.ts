import type { MacroStep, MacroExecutionContext } from "@nexo/shared";
import os from "node:os";
import path from "node:path";
import { resolveMacroField } from "./macro-condition.js";

export type MacroActionExecution = { value: unknown; approvalId?: string };

const MUTATING_ACTIONS = new Set(["email.mark_read", "email.archive", "filesystem.move", "filesystem.copy", "filesystem.rename", "filesystem.create_folder", "filesystem.open_path", "system.open_application", "browser.open_url", "browser.open", "browser.click", "browser.input", "browser.download"]);

/** Structured actions are translated into deterministic agent requests so all writes still cross PermissionEngine/ApprovalService. */
export class MacroStepExecutor {
  constructor(private executeCommand: (command: string,signal?:AbortSignal) => Promise<unknown>) {}

  async execute(action: MacroStep, context: MacroExecutionContext,signal?:AbortSignal): Promise<MacroActionExecution> {
    if(signal?.aborted)throw signal.reason??new Error("Execução da macro cancelada.");
    const config = resolveMacroConfig(action.config, context);
    if (context.trigger.data.dryRun === true && action.type === "nexo.command") return { value: { ok:true, dryRun:true, summary:`Simulação: o Nexo atenderia ao pedido “${displayText(config.command).trim()}”. Nenhuma tarefa foi iniciada.` } };
    if (context.trigger.data.dryRun === true && action.type === "notification.show") return { value: { ok:true, dryRun:true, summary:`Simulação: mostraria a notificação “${displayText(config.title)||"Automação concluída"}”.` } };
    if (context.trigger.data.dryRun === true && action.type === "system.wait") return { value: { ok:true, dryRun:true, summary:`Simulação: aguardaria ${Number(config.seconds)||0} segundo(s).` } };
    if (context.trigger.data.dryRun === true && MUTATING_ACTIONS.has(action.type)) {
      return { value: { ok:true, dryRun:true, summary:`Simulação: ${describeMutation(action.type,config)} Nenhuma alteração foi executada.` } };
    }
    if(action.type==="system.wait"){
      const seconds=Number(config.seconds);
      if(!Number.isFinite(seconds)||seconds<0||seconds>300)throw new Error("A espera deve estar entre 0 e 300 segundos.");
      await waitWithSignal(seconds*1000,signal);
      return {value:{ok:true,summary:`Aguardou ${seconds} segundo(s).`}};
    }
    if (action.type === "notification.show") {
      const title = displayText(config.title) || "Automação concluída";
      const content = displayText(config.content);
      return { value: { ok:true, summary:content ? `${title}: ${content}` : title, notification:{ title, content } } };
    }
    const command = this.commandFor(action.type, config, context);
    const value = await this.executeCommand(command,signal);
    return { value, approvalId:extractApprovalId(value) };
  }

  private commandFor(type: string, config: Record<string, unknown>, context: MacroExecutionContext): string {
    if (type === "nexo.command") {
      const command = displayText(config.command).trim();
      if (!command) throw new Error("A ação não possui comando configurado.");
      if (context.trigger.data.dryRun === true) return `SIMULAÇÃO. Não execute mutações. Explique o que faria para atender: ${command}`;
      return command;
    }
    if(type==="system.open_application")return `Abra o aplicativo ${displayText(config.application).trim()}`;
    if(type==="filesystem.open_path")return `Abra o caminho ${quote(displayText(config.path))}`;
    if(type==="filesystem.copy")return `Copie o arquivo ${quote(displayText(config.source))} para ${quote(displayText(config.destination))}`;
    if(type==="filesystem.rename")return `Renomeie o arquivo ${quote(displayText(config.path))} para ${quote(displayText(config.newPath))}`;
    if(type==="filesystem.create_folder")return `Crie a pasta ${quote(displayText(config.path))}`;
    if(type==="browser.open_url")return `Abra a URL ${displayText(config.url).trim()}`;
    if(type==="browser.download"){const payload=JSON.stringify({selector:displayText(config.selector),path:displayText(config.path)});return `[[NEXO_TOOL:browser_download]] ${payload}`;}
    if(type==="browser.click"||type==="browser.input"){const payload=JSON.stringify(type==="browser.click"?{selector:displayText(config.selector)}:{selector:displayText(config.selector),text:displayText(config.text)});return `[[NEXO_TOOL:${type==="browser.click"?"browser_click":"browser_type"}]] ${payload}`;}
    if(type==="web.search")return `Pesquise na web ${displayText(config.query).trim()}`;
    if(type==="web.fetch"||type==="browser.extract")return `Leia e resuma a página ${quote(displayText(config.url).trim())}`;
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
    if (type === "ai.summarize") return `Resuma de forma objetiva o seguinte conteúdo:\n\n${serialize(config.source)}`;
    if (type === "ai.classify") return `Classifique o conteúdo a seguir e explique a classificação de forma curta:\n\n${serialize(config.source)}`;
    throw new Error(`Ação de automação não registrada: ${type}`);
  }
}

function waitWithSignal(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal?.aborted){reject(signal.reason??new Error("Execução da macro cancelada."));return;}const finish=()=>{signal?.removeEventListener("abort",abort);resolve();};const timer=setTimeout(finish,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(signal?.reason??new Error("Execução da macro cancelada."));};signal?.addEventListener("abort",abort,{once:true});});}

export function resolveMacroConfig(config: Record<string, unknown>, context: MacroExecutionContext): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([key,value])=>[key,resolveValue(value,context)]));
}
function resolveValue(value: unknown, context: MacroExecutionContext): unknown {
  if (typeof value === "string" && value.startsWith("$")) return resolveMacroField(value,context);
  if(typeof value==="string")return value.replace(/\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g,(_match,token:string)=>resolveMacroVariable(token,context));
  if (Array.isArray(value)) return value.map(item=>resolveValue(item,context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,resolveValue(item,context)]));
  return value;
}
function resolveMacroVariable(token:string,context:MacroExecutionContext):string{
  if(token==="today"){const now=new Date();return`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;}
  const folders:Record<string,string>={downloads:process.env.NEXO_SYSTEM_DOWNLOADS??path.join(os.homedir(),"Downloads"),documents:process.env.NEXO_SYSTEM_DOCUMENTS??path.join(os.homedir(),"Documents"),desktop:process.env.NEXO_SYSTEM_DESKTOP??path.join(os.homedir(),"Desktop")};
  if(folders[token])return folders[token];
  if(token==="macro.output"){
    const last=Object.values(context.actionResults).at(-1);if(last===undefined)throw new Error("{{macro.output}} exige uma etapa anterior com resultado.");
    if(last&&typeof last==="object"){const record=last as Record<string,unknown>,data=record.data&&typeof record.data==="object"?record.data as Record<string,unknown>:undefined;for(const value of[data?.path,data?.output,record.output,record.text,record.content,record.summary])if(typeof value==="string")return value;}
    if(typeof last==="string"||typeof last==="number"||typeof last==="boolean")return String(last);
    return JSON.stringify(last);
  }
  throw new Error(`Variável de macro desconhecida: {{${token}}}.`);
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
  if(type==="filesystem.copy")return`copiaria ${displayText(config.source)||"o arquivo"} para ${displayText(config.destination)||"o destino configurado"}.`;
  if(type==="filesystem.rename")return`renomearia ${displayText(config.path)||"o arquivo"} para ${displayText(config.newPath)||"o novo nome"}.`;
  if(type==="filesystem.create_folder")return`criaria a pasta ${displayText(config.path)||"configurada"}.`;
  if(type==="filesystem.open_path")return`abriria ${displayText(config.path)||"o caminho configurado"}.`;
  if(type==="system.open_application")return`abriria ${displayText(config.application)||"o aplicativo configurado"}.`;
  if(type==="browser.open_url")return`abriria ${displayText(config.url)||"a URL configurada"}.`;
  if(type==="browser.open")return`abriria ${displayText(config.url)||"a URL configurada"}.`;
  if(type==="browser.click")return`clicaria em ${displayText(config.selector)||"o elemento configurado"}.`;
  if(type==="browser.input")return`preencheria ${displayText(config.selector)||"o campo configurado"}.`;
  return`executaria ${type}.`;
}
function quote(value:string):string { if(!value)throw new Error("A ação está sem um campo obrigatório.");return JSON.stringify(value); }
function serialize(value:unknown):string { return typeof value==="string"?value:JSON.stringify(value,null,2); }
