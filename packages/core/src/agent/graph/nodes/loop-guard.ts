import type { AgentGraphState } from "../graph-state.js";
import {LoopGuard} from "../../loop/loop-guard.js";
export function loopGuardNode(state: AgentGraphState) {const loop=state.loopState;if(!loop)return{stage:"LOOP_GUARD" as const,error:"Loop guard sem estado."};const result=new LoopGuard(2,2).evaluate(loop.actionFingerprints,loop.observationFingerprints);return result.ok?{stage:"LOOP_GUARD" as const,loopState:loop,error:undefined}:{stage:"LOOP_GUARD" as const,loopState:{...loop,status:"FAILED" as const,finalResponse:result.reason},error:undefined};}
