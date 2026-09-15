import type { AgentToolSchema } from "../provider.js";
import type { AgentToolDescriptor } from "../../agent/orchestrator/tool-catalog.js";

/** Converts the registry-derived catalog to the provider-neutral agent schema. */
export function createAgentToolSchemas(catalog: AgentToolDescriptor[]): AgentToolSchema[] {
  return catalog.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters ?? { type: "object", properties: {} } }));
}
