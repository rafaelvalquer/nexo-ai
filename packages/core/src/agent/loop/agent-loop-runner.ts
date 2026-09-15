import type { LLMProvider } from "../../llm/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { ActionExecutor } from "../execution/action-executor.js";
import type { CapabilityAwareToolCatalog } from "../orchestrator/tool-catalog.js";
import type { ConnectionService } from "../../connections/service.js";
import type { ConnectionCapability } from "@nexo/shared";
import { createAgentToolSchemas } from "../../llm/agent/tool-schema-factory.js";
import { AgentLoop } from "./agent-loop.js";
import { encodeObservation } from "./observation-encoder.js";
import type { AgentLoopState } from "./types.js";

/** Bridges provider, current capability catalog and the sole execution authority. */
export class AgentLoopRunner {
  constructor(private readonly llm: LLMProvider, private readonly catalog: CapabilityAwareToolCatalog, private readonly registry: ToolRegistry, private readonly executor: ActionExecutor, private readonly connections?: ConnectionService) {}
  async run(userRequest: string, options: { mode: "read_only" | "full"; runId?: string; signal?: AbortSignal } ): Promise<AgentLoopState> {
    if (!this.llm.agentTurn) throw new Error("O provider de LLM não implementa agentTurn().");
    const available = this.catalog.list().filter(tool => options.mode === "full" || !tool.mutatesState || tool.risk === "READ");
    const schemas = createAgentToolSchemas(available);
    const allowed = new Set(schemas.map(tool => tool.name));
    const loop = new AgentLoop({
      agentTurn: (request, signal) => this.llm.agentTurn!({ ...request, tools: schemas }, signal), tools: () => schemas,
      preflight: (name, input, context) => {
        if (!allowed.has(name)) return Promise.resolve({ ok: false as const, code: "TOOL_NOT_FOUND" as const, message: "A ferramenta não está disponível neste modo do Agent Loop." });
        return this.executor.preflight(name, input, { ...context, capabilityResolver: permission => this.hasCapability(permission, input) });
      },
      execute: (action, context) => this.executor.execute(action, context),
      observe: (execution, callId) => encodeObservation(callId, execution.action.toolName, execution.result ?? { ok: false, summary: "A execução não retornou resultado.", error: execution.error }, "UNTRUSTED_CONTENT")
    });
    return loop.run(userRequest, { runId: options.runId, signal: options.signal });
  }
  private hasCapability(permission: string, input: Record<string, unknown>) {
    const connectionCapability = new Set<ConnectionCapability>(["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"]);
    if (!connectionCapability.has(permission as ConnectionCapability)) return true;
    if (!this.connections) return false;
    const requested = typeof input.connectionId === "string" ? this.connections.get(input.connectionId)?.capabilities.includes(permission as ConnectionCapability) : this.connections.resolveForCapability(permission as ConnectionCapability).status === "ready";
    return Boolean(requested);
  }
}
