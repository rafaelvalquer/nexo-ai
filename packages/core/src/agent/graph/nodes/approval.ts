import type { AgentGraphState } from "../graph-state.js";
export function approvalNode(state: AgentGraphState) {const loop=state.loopState;return loop?.status==="WAITING_APPROVAL"&&loop.pendingAction?{stage:"APPROVAL" as const,loopState:loop,error:undefined}:{stage:"APPROVAL" as const,error:"Estado de aprovação inconsistente."};}
