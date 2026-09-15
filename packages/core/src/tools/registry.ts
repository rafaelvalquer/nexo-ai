import type { ToolDefinition } from "./types.js";
import { filesystemTools } from "./filesystem/index.js";
import { systemTools } from "./system/index.js";
import { applicationTools } from "./system/applications.js";
import { shellTools } from "./system/shell.js";
import { browserTools } from "./browser/index.js";
import { memoryTools } from "./memory/index.js";
import type { MemoryService } from "../memory/index.js";
import type { EmailService } from "../email/service.js";
import { emailTools } from "./email/index.js";
import type { CalendarService } from "../calendar/service.js";
import { calendarTools } from "./calendar/index.js";
import type { BrowserSessionManager } from "../browser/browser-session-manager.js";
import { zodToJsonSchema } from "zod-to-json-schema";

let activeToolRegistry: ToolRegistry | undefined;

export class ToolRegistry {
  private tools = new Map<string,ToolDefinition>();
  constructor(memory?:MemoryService,email?:EmailService,calendar?:CalendarService,browserSessions?:BrowserSessionManager) {
    const base=[...filesystemTools(),...systemTools(),...applicationTools(),...shellTools(),...browserTools(browserSessions)];
    const mem=memory?memoryTools(memory):[];
    this.register(...base,...mem,...(email?emailTools(email):[]),...(calendar?calendarTools(calendar):[]));
    activeToolRegistry=this;
  }
  register(...tools:ToolDefinition[]) { for (const tool of tools) {const mutates=tool.mutatesState??tool.risk!=="READ";tool.mutatesState=mutates;tool.agent??={category:tool.domain??domain(tool.name),outputTrust:outputTrust(tool)};if(mutates&&!tool.mutationSafety)tool.mutationSafety={idempotency:tool.supportsIdempotency?"provider":"none",reconciliation:"supported"};this.tools.set(tool.name,tool);} return this; }
  unregister(name:string) { return this.tools.delete(name); }
  get(name:string){return this.tools.get(name);}
  definitions(){return[...this.tools.values()];}
  agentSchema(name:string){const tool=this.tools.get(name);return tool?describeProperties(zodToJsonSchema(tool.inputSchema,{$refStrategy:"none"})):undefined;}
  list(){return[...this.tools.values()].map(t=>({name:t.name,description:t.description,risk:t.risk,permissions:t.permissions,domain:t.domain,operation:t.operation,mutatesState:t.mutatesState??t.risk!=="READ"}));}
  listForAgent(){return[...this.tools.values()].map(tool=>({name:tool.name,description:tool.description,risk:tool.risk,permissions:tool.permissions,domain:tool.domain,operation:tool.operation,mutatesState:tool.mutatesState??tool.risk!=="READ",requiresConfirmation:tool.mutatesState??tool.risk!=="READ",parameters:zodToJsonSchema(tool.inputSchema,{$refStrategy:"none"})}));}
}

/** Read-only automation trigger probes reuse the already configured application registry. */
export function getActiveToolRegistry(): ToolRegistry | undefined { return activeToolRegistry; }
function domain(name:string){return name.split("_")[0]??"general";}
function outputTrust(tool:ToolDefinition):"trusted_local"|"untrusted_external"|"sensitive_local"{if(/^(email|calendar|browser)_/.test(tool.name))return"untrusted_external";if(tool.pathFields?.length||tool.name.startsWith("memory_"))return"sensitive_local";return"trusted_local";}
function describeProperties(schema:any):any{const labels:Record<string,string>={connectionId:"ID da conexão autorizada a usar.",path:"Caminho absoluto dentro de uma raiz permitida.",source:"Caminho absoluto da origem autorizada.",destination:"Caminho absoluto do destino autorizado.",query:"Consulta de pesquisa fornecida pelo usuário.",messageId:"ID estável da mensagem retornado por uma ferramenta anterior.",messageIds:"IDs estáveis das mensagens retornados por ferramentas anteriores.",eventId:"ID estável do compromisso retornado por uma ferramenta anterior.",url:"URL HTTP ou HTTPS a acessar.",start:"Início em data/hora ISO 8601.",end:"Término em data/hora ISO 8601.",title:"Título explícito da entidade.",to:"Destinatários explícitos confirmados pelo usuário.",subject:"Assunto do e-mail.",bodyText:"Corpo textual do e-mail."};if(schema?.properties)for(const[key,value]of Object.entries<any>(schema.properties)){value.description??=labels[key]??`Valor do parâmetro ${key}.`;describeProperties(value);}if(schema?.items)describeProperties(schema.items);return schema;}
