import type { AgentGraphState } from "../graph-state.js";
export function bootstrapNode(state: AgentGraphState) { return { stage: "BOOTSTRAP" as const, runId: state.runId }; }
