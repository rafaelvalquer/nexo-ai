import type {ToolResult} from "@nexo/shared";
import {OutcomeVerifier} from "../../outcome/verifier.js";
import type {GoalOutcome} from "../../outcome/types.js";
import type {AgentLoopState} from "../../loop/types.js";
import type {AgentGraphState,AgentGraphUpdate} from "../graph-state.js";

const MAX_CORRECTION_ROUNDS=2;

export function verifyGoalNode(verifier:OutcomeVerifier=new OutcomeVerifier()){
 return async(state:AgentGraphState):Promise<AgentGraphUpdate>=>{
  const loop=state.loopState;
  if(!loop)return{stage:"VERIFY_GOAL",error:"Verificação de objetivo sem estado."};
  const observation=loop.observations.at(-1);
  if(!observation){const unknown:GoalOutcome={status:"unknown",verified:false,reason:"NO_OBSERVATION"};return{stage:"VERIFY_GOAL",loopState:{...loop,goalOutcome:unknown},error:undefined};}
  const result:ToolResult={success:observation.ok,ok:observation.ok,summary:observation.summary,data:observation.data,...(!observation.ok?{error:{code:"GOAL_OBSERVATION_FAILED",message:observation.summary}}:{})};
  const outcome=await verifier.verifyWithSemanticFallback({userRequest:loop.userRequest,toolName:observation.toolName,result});
  const next:AgentLoopState={...loop,goalOutcome:outcome,lastVerifiedObservationIndex:loop.observations.length-1};
  if(outcome.status==="success"||outcome.status==="unknown")return{stage:"VERIFY_GOAL",loopState:next,error:undefined};
  const rounds=(loop.correctionRounds??0)+1;next.correctionRounds=rounds;
  if(rounds<=MAX_CORRECTION_ROUNDS){
    next.status="DECIDING";next.finalResponse=undefined;
    const detail=outcome.status==="partial"?outcome.unmetGoals.join("; "):outcome.reason;
    next.messages=[...next.messages,{role:"tool",trust:"TRUSTED_LOCAL",content:`GOAL_VERIFICATION_${outcome.status.toUpperCase()}: ${detail}. Corrija o plano sem repetir uma mutação já concluída.`}];
  }else{
    next.status="FAILED";
    next.finalResponse=outcome.status==="partial"?`O objetivo ficou parcial após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.unmetGoals.join("; ")}`:`O objetivo não pôde ser comprovado após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.reason}`;
  }
  return{stage:"VERIFY_GOAL",loopState:next,error:undefined};
 };
}
