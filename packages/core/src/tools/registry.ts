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
import { zodToJsonSchema } from "zod-to-json-schema";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  constructor(memory?: MemoryService, email?: EmailService, calendar?: CalendarService) {
    const base = [...filesystemTools(), ...systemTools(), ...applicationTools(), ...shellTools(), ...browserTools()];
    const mem = memory ? memoryTools(memory) : [];
    for (const tool of [...base, ...mem, ...(email ? emailTools(email) : []), ...(calendar ? calendarTools(calendar) : [])]) this.tools.set(tool.name, tool);
  }
  get(name: string) { return this.tools.get(name); }
  list() { return [...this.tools.values()].map(t => ({ name:t.name, description:t.description, risk:t.risk, permissions:t.permissions })); }
  /** Serializable tool contracts for planning; execution still validates with Zod. */
  listForAgent() {
    return [...this.tools.values()].map(tool => ({
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      permissions: tool.permissions,
      parameters: zodToJsonSchema(tool.inputSchema, { $refStrategy: "none" })
    }));
  }
}
