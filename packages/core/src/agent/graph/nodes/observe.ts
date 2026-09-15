import type { AgentGraphState } from "../graph-state.js";
export function observeNode(state: AgentGraphState) {return state.loopState?{stage:"OBSERVE" as const,loopState:state.loopState,error:undefined}:{stage:"OBSERVE" as const,error:"Observação sem estado."};}
