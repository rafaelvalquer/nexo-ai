import type { AgentGraphState } from "../graph-state.js";
export function reconcileNode(state: AgentGraphState) {const loop=state.loopState;return loop&&["RESULT_UNKNOWN","RECONCILING"].includes(loop.status)?{stage:"RECONCILE" as const,loopState:loop,error:undefined}:{stage:"RECONCILE" as const,error:"Reconciliation sem RESULT_UNKNOWN."};}
