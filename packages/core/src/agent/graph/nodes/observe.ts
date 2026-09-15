import type { AgentGraphState } from "../graph-state.js";
export function observeNode(_state: AgentGraphState) { return { stage: "OBSERVE" as const }; }
