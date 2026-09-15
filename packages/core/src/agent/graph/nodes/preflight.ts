import type { AgentGraphState } from "../graph-state.js";
export function preflightNode(_state: AgentGraphState) { return { stage: "PREFLIGHT" as const }; }
