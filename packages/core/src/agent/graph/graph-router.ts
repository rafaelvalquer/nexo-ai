import type { AgentGraphState } from "./graph-state.js";

export function routeAfterTurn(state: AgentGraphState) {
  if (state.error) return "finalize" as const;
  switch (state.loopState?.status) {
    case "WAITING_APPROVAL": return "approval" as const;
    case "RESULT_UNKNOWN":
    case "RECONCILING": return "reconcile" as const;
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED": return "finalize" as const;
    default: return "validate_call" as const;
  }
}

export function routeAfterGuard(state: AgentGraphState) {
  return state.loopState?.status === "DECIDING" ? "agent_turn" as const : "finalize" as const;
}
