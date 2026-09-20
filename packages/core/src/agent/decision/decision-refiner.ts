import type {ContextEvidence,DecisionCandidate} from "./types.js";
import type {GoalSatisfaction} from "./goal-satisfaction.js";
import {evaluateDecisionConfidence,type DecisionConfidenceInput} from "../../intent/confidence-evaluator.js";
export type DecisionRefinement={
 selectedCandidate?:DecisionCandidate;
 confidence:number;
 rejectedCandidates:Array<{candidate:DecisionCandidate;reason:string}>;
 clarificationNeeded:boolean;
 clarificationReason?:string;
};
export class DecisionRefiner{
 refine(input:{current?:DecisionCandidate;alternatives?:DecisionCandidate[];context?:ContextEvidence[];goalByKey?:Map<string,GoalSatisfaction>}):DecisionRefinement{
  const candidates=[input.current,...(input.alternatives??[])].filter(Boolean) as DecisionCandidate[];
  const rejected:DecisionRefinement["rejectedCandidates"]=[],scored:Array<{candidate:DecisionCandidate;confidence:number}>=[];
  for(const candidate of candidates){
    const goal=input.goalByKey?.get(key(candidate))??{status:"unknown",score:.7} as GoalSatisfaction;
    if(goal.status==="unsatisfied"){rejected.push({candidate,reason:goal.reason??"GOAL_NOT_SATISFIED"});continue;}
    if(candidate.missing.length){rejected.push({candidate,reason:`MISSING:${candidate.missing.join(",")}`});continue;}
    const weakContext=(input.context??[]).some(item=>item.confidence<.7&&Object.values(candidate.entities).includes(item.value));
    if(weakContext&&candidate.mutatesState){rejected.push({candidate,reason:"WEAK_CONTEXT_FOR_MUTATION"});continue;}
    const confidence=evaluateDecisionConfidence({operationScore:candidate.confidence,entityCompleteness:candidate.missing.length?0:1,contextConfidence:contextConfidence(input.context),goalScore:goal.score,schemaValidity:1,semanticValidity:goal.status==="satisfied"?1:.8,ambiguityCount:candidate.ambiguities.length,conflictCount:0,mutatesState:candidate.mutatesState}).overall;
    scored.push({candidate:{...candidate,confidence},confidence});
  }
  scored.sort((a,b)=>b.confidence-a.confidence);
  const top=scored[0];if(!top)return{confidence:0,rejectedCandidates:rejected,clarificationNeeded:rejected.some(item=>/MISSING|WEAK_CONTEXT/.test(item.reason)),clarificationReason:rejected[0]?.reason};
  if(top.candidate.mutatesState&&top.confidence<.95)return{selectedCandidate:top.candidate,confidence:top.confidence,rejectedCandidates:rejected,clarificationNeeded:true,clarificationReason:"MUTATION_CONFIDENCE_BELOW_THRESHOLD"};
  if(!top.candidate.mutatesState&&top.confidence<.75)return{selectedCandidate:top.candidate,confidence:top.confidence,rejectedCandidates:rejected,clarificationNeeded:true,clarificationReason:"READ_CONFIDENCE_BELOW_THRESHOLD"};
  return{selectedCandidate:top.candidate,confidence:top.confidence,rejectedCandidates:rejected,clarificationNeeded:false};
 }
}
function key(candidate:DecisionCandidate){return`${candidate.source}:${candidate.proposedTool??candidate.operation}`;}
function contextConfidence(context?:ContextEvidence[]){if(!context?.length)return 1;return context.reduce((sum,item)=>sum+item.confidence,0)/context.length;}
