import type {ToolResult} from "@nexo/shared";
import {OutcomeVerifier} from "../../outcome/verifier.js";
import {updateGoalProgress} from "../../outcome/goal-progress-state.js";
import type {AgentGraphState,AgentGraphUpdate} from "../graph-state.js";

export function verifyStepGoalNode(verifier:OutcomeVerifier=new OutcomeVerifier()){
 return async(state:AgentGraphState):Promise<AgentGraphUpdate>=>{
  const loop=state.loopState;if(!loop)return{stage:"VERIFY_STEP_GOAL",error:"Verificação de etapa sem estado."};
  const observation=loop.observations.at(-1);if(!observation)return{stage:"VERIFY_STEP_GOAL",loopState:loop,error:undefined};
  const result:ToolResult={success:observation.ok,ok:observation.ok,summary:observation.summary,data:observation.data,...(!observation.ok?{error:{code:"GOAL_OBSERVATION_FAILED",message:observation.summary}}:{})};
  const outcome=await verifier.verifyWithSemanticFallback({userRequest:stepGoal(loop.userRequest,observation.toolName),toolName:observation.toolName,result});
  const index=loop.observations.length-1,goalProgress=updateGoalProgress(loop.goalProgress,loop.userRequest,index,observation.toolName,outcome);
  return{stage:"VERIFY_STEP_GOAL",loopState:{...loop,goalProgress,lastVerifiedObservationIndex:index},error:undefined};
 };
}
function stepGoal(original:string,tool:string){
 if(/^web_(?:research|search)$/.test(tool))return`Pesquise as informações solicitadas em: ${original}`;
 if(/summarize/.test(tool))return`Resuma o material necessário para: ${original}`;
 if(/^(?:create_text_file|write_text_file|document_create)/.test(tool))return`Salve o resultado necessário para: ${original}`;
 return original;
}
