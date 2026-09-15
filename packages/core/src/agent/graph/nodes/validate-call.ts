import type { AgentGraphState } from "../graph-state.js";
export function validateCallNode(_state: AgentGraphState) { return { stage: "VALIDATE_CALL" as const }; }
