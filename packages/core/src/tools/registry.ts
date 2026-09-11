import type { ToolDefinition } from "./types.js";
import { filesystemTools } from "./filesystem/index.js";
import { systemTools } from "./system/index.js";
import { applicationTools } from "./system/applications.js";
import { shellTools } from "./system/shell.js";
import { browserTools } from "./browser/index.js";
import { memoryTools } from "./memory/index.js";
import type { MemoryService } from "../memory/index.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  constructor(memory?: MemoryService) {
    const base = [...filesystemTools(), ...systemTools(), ...applicationTools(), ...shellTools(), ...browserTools()];
    const mem = memory ? memoryTools(memory) : [];
    for (const tool of [...base, ...mem]) this.tools.set(tool.name, tool);
  }
  get(name: string) { return this.tools.get(name); }
  list() { return [...this.tools.values()].map(t => ({ name:t.name, description:t.description, risk:t.risk, permissions:t.permissions })); }
}

