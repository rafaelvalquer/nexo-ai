import type { AgentGraphState } from "../graph-state.js";
export function loopGuardNode(_state: AgentGraphState) { return { stage: "LOOP_GUARD" as const }; }
