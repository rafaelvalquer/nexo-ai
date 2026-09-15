import { randomUUID } from "node:crypto";
import { validateAgentTurn } from "./agent-protocol.js";
import { DEFAULT_AGENT_LOOP_LIMITS, type AgentLoopDependencies, type AgentLoopLimits, type AgentLoopState } from "./types.js";

/** Iterative, one-tool-per-turn loop. It never dispatches an unapproved or ambiguous mutation. */
export class AgentLoop {
  constructor(private readonly deps: AgentLoopDependencies, private readonly limits: AgentLoopLimits = DEFAULT_AGENT_LOOP_LIMITS) {}
  async run(userRequest: string, options: { runId?: string; deadlineAt?: string; signal?: AbortSignal } = {}): Promise<AgentLoopState> {
    const state: AgentLoopState = { version: 2, runId: options.runId ?? randomUUID(), userRequest, messages: [{ role: "user", content: userRequest, trust: "TRUSTED_LOCAL" }], observations: [], iteration: 0, toolCallCount: 0, consecutiveFailures: 0, protocolRepairCount: 0, startedAt: new Date().toISOString(), deadlineAt: options.deadlineAt ?? new Date(Date.now() + 5 * 60_000).toISOString(), status: "DECIDING" };
    while (state.status === "DECIDING") {
      if (options.signal?.aborted) return { ...state, status: "CANCELLED" };
      if (Date.now() >= Date.parse(state.deadlineAt) || state.iteration >= this.limits.maxIterations || state.toolCallCount >= this.limits.maxToolCalls) return fail(state, "Limite seguro do agent loop atingido.");
      const decision = validateAgentTurn(await this.deps.agentTurn({ messages: state.messages, tools: this.deps.tools() }, options.signal));
      if (decision.kind === "final") return { ...state, status: "COMPLETED", finalResponse: decision.content };
      if (decision.kind === "repair") { const repairs = state.protocolRepairCount + 1; if (repairs > this.limits.maxProtocolRepairAttempts) return fail({ ...state, protocolRepairCount: repairs }, decision.error); state.protocolRepairCount = repairs; state.messages.push({ role: "tool", content: decision.error, trust: "TRUSTED_LOCAL" }); continue; }
      state.status = "PREFLIGHT";
      const preflight = await this.deps.preflight(decision.call.name, decision.call.arguments, { runId: state.runId, signal: options.signal });
      if (!preflight.ok) { state.consecutiveFailures++; if (state.consecutiveFailures >= this.limits.maxConsecutiveFailures) return fail(state, preflight.message); state.messages.push({ role: "tool", toolCallId: decision.call.id, content: `ACTION_ERROR: ${preflight.message}`, trust: "TRUSTED_LOCAL" }); state.status = "DECIDING"; continue; }
      const action = preflight.action;
      state.pendingAction = { callId: decision.call.id, toolName: action.toolName, input: action.input, fingerprint: action.fingerprint, executionId: action.executionId, idempotencyKey: action.idempotencyKey, iteration: state.iteration, mutatesState: action.mutatesState };
      if (action.requiresApproval) return { ...state, status: "WAITING_APPROVAL" };
      state.status = "EXECUTING";
      const execution = await this.deps.execute(action, { runId: state.runId, signal: options.signal });
      if (execution.status === "RESULT_UNKNOWN") return { ...state, status: "RESULT_UNKNOWN" };
      state.status = "OBSERVING";
      const observation = this.deps.observe(execution, decision.call.id);
      state.observations.push(observation); state.messages.push({ role: "tool", toolCallId: decision.call.id, content: JSON.stringify({ source: action.toolName, trust: observation.trust, data: observation.data, references: observation.references, summary: observation.summary }), trust: observation.trust });
      state.toolCallCount++; state.iteration++; state.pendingAction = undefined; state.consecutiveFailures = execution.status === "SUCCEEDED" ? 0 : state.consecutiveFailures + 1;
      if (state.consecutiveFailures >= this.limits.maxConsecutiveFailures) return fail(state, "Falhas consecutivas excederam o limite seguro.");
      state.status = "DECIDING";
    }
    return state;
  }
}
function fail(state: AgentLoopState, finalResponse: string): AgentLoopState { return { ...state, status: "FAILED", finalResponse }; }
