import type { AgentToolSchema } from "../provider.js";
import type { AgentToolDescriptor } from "../../agent/orchestrator/tool-catalog.js";

const CONNECTION_CAPABILITIES = new Set(["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"]);

/** Converts the registry-derived catalog to the provider-neutral agent schema. */
export function createAgentToolSchemas(catalog: AgentToolDescriptor[]): AgentToolSchema[] {
  return catalog.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: agentVisibleParameters(tool),
    polling: tool.metadata?.polling
  }));
}

function agentVisibleParameters(tool: AgentToolDescriptor) {
  const schema = structuredClone(tool.parameters ?? { type: "object", properties: {} }) as any;
  if (!tool.permissions.some(permission => CONNECTION_CAPABILITIES.has(permission))) return schema;

  if (schema?.properties && typeof schema.properties === "object") delete schema.properties.connectionId;
  if (Array.isArray(schema?.required)) schema.required = schema.required.filter((field: unknown) => field !== "connectionId");
  return schema;
}
