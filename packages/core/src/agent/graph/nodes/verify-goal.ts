import type {ToolResult} from "@nexo/shared";
import {OutcomeVerifier} from "../../outcome/verifier.js";
import type {AgentGraphState} from "../graph-state.js";

const MAX_CORRECTION_ROUNDS=2;

export function verifyGoalNode(state:AgentGraphState){
  const loop=state.loopState;
  if(!loop)return{stage:"VERIFY_GOAL" as const,error:"Verificação de objetivo sem estado."};
  const observation=loop.observations.at(-1);
  if(!observation)return{stage:"VERIFY_GOAL" as const,loopState:{...loop,goalOutcome:{status:"unknown",verified:false,reason:"NO_OBSERVATION"}},error:undefined};
  const result:ToolResult={success:observation.ok,ok:observation.ok,summary:observation.summary,data:observation.data,...(!observation.ok?{error:{code:"GOAL_OBSERVATION_FAILED",message:observation.summary}}:{})};
  const outcome=new OutcomeVerifier().verify({userRequest:loop.userRequest,toolName:observation.toolName,result});
  const next={...loop,goalOutcome:outcome,lastVerifiedObservationIndex:loop.observations.length-1};
  if(outcome.status==="success"||outcome.status==="unknown")return{stage:"VERIFY_GOAL" as const,loopState:next,error:undefined};
  const rounds=(loop.correctionRounds??0)+1;
  next.correctionRounds=rounds;
  if(rounds<=MAX_CORRECTION_ROUNDS){
    next.status="DECIDING";
    next.finalResponse=undefined;
    const detail=outcome.status==="partial"?outcome.unmetGoals.join("; "):outcome.reason;
    next.messages=[...next.messages,{role:"tool" as const,trust:"TRUSTED_LOCAL" as const,content:`GOAL_VERIFICATION_${outcome.status.toUpperCase()}: ${detail}. Corrija o plano sem repetir uma mutação já concluída.`}];
  }else{
    next.status="FAILED";
    next.finalResponse=outcome.status==="partial"?`O objetivo ficou parcial após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.unmetGoals.join("; ")}`:`O objetivo não pôde ser comprovado após ${MAX_CORRECTION_ROUNDS} tentativas de correção: ${outcome.reason}`;
  }
  return{stage:"VERIFY_GOAL" as const,loopState:next,error:undefined};
}
