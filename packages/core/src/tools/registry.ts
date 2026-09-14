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
export class ToolRegistry{
  private tools=new Map<string,ToolDefinition>();
  constructor(memory?:MemoryService,email?:EmailService,calendar?:CalendarService,browserSessions?:BrowserSessionManager){const base=[...filesystemTools(),...systemTools(),...applicationTools(),...shellTools(),...browserTools(browserSessions)];const mem=memory?memoryTools(memory):[];for(const tool of[...base,...mem,...(email?emailTools(email):[]),...(calendar?calendarTools(calendar):[])])this.tools.set(tool.name,tool);}
  get(name:string){return this.tools.get(name);}
  definitions(){return[...this.tools.values()];}
  agentSchema(name:string){const tool=this.tools.get(name);return tool?zodToJsonSchema(tool.inputSchema,{$refStrategy:"none"}):undefined;}
  list(){return[...this.tools.values()].map(t=>({name:t.name,description:t.description,risk:t.risk,permissions:t.permissions,domain:t.domain,operation:t.operation,mutatesState:t.mutatesState??t.risk!=="READ"}));}
  listForAgent(){return[...this.tools.values()].map(tool=>({name:tool.name,description:tool.description,risk:tool.risk,permissions:tool.permissions,domain:tool.domain,operation:tool.operation,mutatesState:tool.mutatesState??tool.risk!=="READ",requiresConfirmation:tool.mutatesState??tool.risk!=="READ",parameters:zodToJsonSchema(tool.inputSchema,{$refStrategy:"none"})}));}
}
