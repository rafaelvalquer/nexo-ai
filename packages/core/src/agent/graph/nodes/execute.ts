import type { AgentGraphState } from "../graph-state.js";
export function executeNode(_state: AgentGraphState) { return { stage: "EXECUTE" as const }; }
