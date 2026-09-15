import type { AgentGraphState } from "../graph-state.js";
export function preflightNode(state: AgentGraphState) {const loop=state.loopState;return loop?{stage:"PREFLIGHT" as const,loopState:loop,error:undefined}:{stage:"PREFLIGHT" as const,error:"Preflight sem estado."};}
