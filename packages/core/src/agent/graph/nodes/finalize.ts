import type { AgentGraphState } from "../graph-state.js";
export function finalizeNode(state: AgentGraphState) { return { stage: "FINALIZE" as const, loopState: state.loopState, error: state.error }; }
