import type {AgentLoopState} from "../loop/types.js";
export type V2ExecutionSafetyState="NO_ACTION"|"READ_ONLY_EXECUTED"|"PREFLIGHT_MUTATION"|"WAITING_APPROVAL"|"DISPATCHING"|"MUTATION_COMPLETED"|"RESULT_UNKNOWN";
export function canFallbackToLegacy(state:V2ExecutionSafetyState):boolean{return state==="NO_ACTION";}
export function executionSafetyState(state:AgentLoopState|undefined):V2ExecutionSafetyState{
  if(!state)return"NO_ACTION";
  if(state.executionSafetyState)return state.executionSafetyState;
  if(state.status==="RESULT_UNKNOWN"||state.status==="RECONCILING")return"RESULT_UNKNOWN";
  if(state.status==="WAITING_APPROVAL")return"WAITING_APPROVAL";
  if(state.status==="EXECUTING")return"DISPATCHING";
  if(state.pendingAction?.mutatesState)return"PREFLIGHT_MUTATION";
  if(state.observations.length)return"READ_ONLY_EXECUTED";
  return"NO_ACTION";
}
