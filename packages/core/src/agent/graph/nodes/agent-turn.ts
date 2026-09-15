import type { AgentLoopState } from "../../loop/types.js";
import type { AgentGraphState } from "../graph-state.js";
export type AgentTurnNodeHandler = (previous?: AgentLoopState) => Promise<AgentLoopState>;
export function agentTurnNode(handler: AgentTurnNodeHandler) { return async (state: AgentGraphState) => { try { return { stage: "AGENT_TURN" as const, loopState: await handler(state.loopState), error: undefined }; } catch (error) { return { stage: "AGENT_TURN" as const, error: error instanceof Error ? error.message : String(error) }; } }; }
