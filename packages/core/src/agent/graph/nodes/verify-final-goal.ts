import {finalProgressOutcome,createGoalProgressState} from "../../outcome/goal-progress-state.js";
import type {AgentLoopState} from "../../loop/types.js";
import type {AgentGraphState,AgentGraphUpdate} from "../graph-state.js";

export const MAX_CORRECTION_ROUNDS=2;

export function verifyFinalGoalNode(){
 return async(state:AgentGraphState):Promise<AgentGraphUpdate>=>{
  const loop=state.loopState;if(!loop)return{stage:"VERIFY_FINAL_GOAL",error:"Verificação final sem estado."};
  const progress=loop.goalProgress??createGoalProgressState(loop.userRequest),outcome=finalProgressOutcome(progress),next:AgentLoopState={...loop,goalProgress:progress,goalOutcome:outcome};
  if(outcome.status==="success"||outcome.status==="unknown")return{stage:"VERIFY_FINAL_GOAL",loopState:next,error:undefined};
  const rounds=(loop.correctionRounds??0)+1;next.correctionRounds=rounds;
  if(rounds<=MAX_CORRECTION_ROUNDS){
   next.status="DECIDING";next.finalResponse=undefined;
   const detail=outcome.status==="partial"?outcome.unmetGoals.join("; "):outcome.reason;
   next.messages=[...next.messages,{role:"tool",trust:"TRUSTED_LOCAL",content:`FINAL_GOAL_${outcome.status.toUpperCase()}: ${detail}. Complete apenas as etapas pendentes. Nunca repita mutação já concluída; reconcilie uma mutação com resultado incerto.`}];
  }else{
   next.status="FAILED";
   next.finalResponse=outcome.status==="partial"?`O objetivo ficou parcial após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.unmetGoals.join("; ")}`:`O objetivo não pôde ser comprovado após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.reason}`;
  }
  return{stage:"VERIFY_FINAL_GOAL",loopState:next,error:undefined};
 };
}
