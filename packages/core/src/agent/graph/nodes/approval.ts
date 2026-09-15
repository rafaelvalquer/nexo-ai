import type { AgentGraphState } from "../graph-state.js";
export function approvalNode(_state: AgentGraphState) { return { stage: "APPROVAL" as const }; }
