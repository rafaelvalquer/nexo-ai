import type { AgentGraphState } from "../graph-state.js";
export function reconcileNode(_state: AgentGraphState) { return { stage: "RECONCILE" as const }; }
