import type { AgentGraphState } from "./graph-state.js";

export function routeAfterTurn(state: AgentGraphState) {
  if (state.error) return "finalize" as const;
  switch (state.loopState?.status) {
    case "WAITING_APPROVAL": return "approval" as const;
    case "RESULT_UNKNOWN":
    case "RECONCILING": return "reconcile" as const;
    case "COMPLETED": return state.loopState.observations.length?"verify_goal" as const:"finalize" as const;
    case "FAILED":
    case "CANCELLED": return "finalize" as const;
    default: return "validate_call" as const;
  }
}

export function routeAfterGuard(state: AgentGraphState) {
  return state.loopState?.status === "DECIDING" ? "agent_turn" as const : "finalize" as const;
}

export function routeAfterVerifyGoal(state:AgentGraphState){
  const loop=state.loopState;
  if(!loop)return"finalize" as const;
  if(loop.status==="DECIDING"&&(loop.goalOutcome?.status==="partial"||loop.goalOutcome?.status==="failed"))return"agent_turn" as const;
  if(loop.status==="DECIDING")return"loop_guard" as const;
  return"finalize" as const;
}
