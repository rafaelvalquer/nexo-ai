import {compatibleDomainEvidence,domainEvidenceConfidence,type DomainEvidenceSnapshot} from "../../intent/domain/domain-evidence-builder.js";
import {evaluateDecisionConfidence} from "../../intent/confidence-evaluator.js";
import type {ContextEvidence,DecisionCandidate} from "./types.js";
import type {GoalSatisfaction} from "./goal-satisfaction.js";
import {HardVetoMatrix} from "./hard-veto-matrix.js";
import {SemanticCandidateDeduper,type SemanticCandidateGroup} from "./semantic-candidate-deduper.js";

export const MIN_DECISION_MARGIN={READ:.08,MUTATION:.12} as const;
export type GlobalDecisionResult={selectedCandidate?:DecisionCandidate;selectedGroupId?:string;candidateGroups:SemanticCandidateGroup[];confidence:number;margin:number;rejectedCandidates:Array<{candidate:DecisionCandidate;reason:string}>;clarificationNeeded:boolean;clarificationReason?:string};

export class GlobalDecisionArbiter{
 constructor(private readonly veto=new HardVetoMatrix(),private readonly deduper=new SemanticCandidateDeduper()){}
 decide(input:{userText:string;candidates:DecisionCandidate[];supportingCandidates?:DecisionCandidate[];domainEvidence:DomainEvidenceSnapshot;expectedDomain?:string;context?:ContextEvidence[];goalByKey?:Map<string,GoalSatisfaction>;failurePenaltyByKey?:Map<string,number>;hardVetoEnabled?:boolean;semanticCandidateDedupEnabled?:boolean;webFilenameVetoEnabled?:boolean}):GlobalDecisionResult{
  const rejected:GlobalDecisionResult["rejectedCandidates"]=[],scored:Array<{group:SemanticCandidateGroup;candidate:DecisionCandidate;score:number}>=[];
  const groups=input.semanticCandidateDedupEnabled===false?input.candidates.map(candidate=>({groupId:candidate.candidateId,candidate,memberCandidateIds:[candidate.candidateId],mergedSources:[candidate.source],duplicateCount:0})):this.deduper.group(input.candidates);
  for(const group of groups){
   const candidate=group.candidate;
   const veto=input.hardVetoEnabled===false?{veto:false}:this.veto.evaluate(input.userText,candidate,input.domainEvidence,{webFilenameVetoEnabled:input.webFilenameVetoEnabled!==false});
   if(veto.veto){rejected.push({candidate,reason:veto.reason??"HARD_VETO"});continue;}
   const goal=input.goalByKey?.get(key(candidate))??{status:"unknown",score:.7} as GoalSatisfaction;
   if(goal.status==="unsatisfied"){rejected.push({candidate,reason:goal.reason??"GOAL_NOT_SATISFIED"});continue;}
   if(candidate.missing.length){rejected.push({candidate,reason:`MISSING:${candidate.missing.join(",")}`});continue;}
   const weak=(input.context??[]).some(item=>item.confidence<.7&&Object.values(candidate.entities).includes(item.value));
   if(weak&&candidate.mutatesState){rejected.push({candidate,reason:"WEAK_CONTEXT_FOR_MUTATION"});continue;}
   const observedDomain=input.expectedDomain?(compatibleDomainEvidence(input.expectedDomain,candidate.domain)?1:0):domainEvidenceConfidence(input.domainEvidence,candidate.domain);
   const domainConsistency=input.expectedDomain?observedDomain:Math.max(observedDomain,sourceDomainFloor(candidate));
   if(input.expectedDomain&&domainConsistency===0&&domainEvidenceConfidence(input.domainEvidence,input.expectedDomain)>=.75){rejected.push({candidate,reason:`DOMAIN_MISMATCH:${input.expectedDomain}:${candidate.domain}`});continue;}
   const operationScore=Math.max(candidate.confidence,plannerSupportScore(candidate,input.supportingCandidates));
   const score=evaluateDecisionConfidence({domainConsistency,operationScore,entityCompleteness:1,goalScore:goal.score,contextConfidence:contextConfidence(input.context),deterministicEvidence:deterministicScore(candidate),verifiedMemory:verifiedMemoryScore(candidate,input.supportingCandidates),ambiguityCount:candidate.ambiguities.length,conflictCount:0,failurePenalty:input.failurePenaltyByKey?.get(key(candidate))??0,mutatesState:candidate.mutatesState}).overall;
   scored.push({group,candidate:{...candidate,confidence:score},score});
  }
  scored.sort((a,b)=>b.score-a.score);const top=scored[0],second=scored[1];
  if(!top)return{candidateGroups:groups,confidence:0,margin:0,rejectedCandidates:rejected,clarificationNeeded:rejected.length>0,clarificationReason:rejected[0]?.reason};
  const margin=round(top.score-(second?.score??0)),minMargin=top.candidate.mutatesState?MIN_DECISION_MARGIN.MUTATION:MIN_DECISION_MARGIN.READ,minConfidence=top.candidate.mutatesState?.valueOf()?0.90:0.75;
  if(second&&margin<minMargin)return{selectedCandidate:top.candidate,selectedGroupId:top.group.groupId,candidateGroups:groups,confidence:top.score,margin,rejectedCandidates:rejected,clarificationNeeded:true,clarificationReason:"DECISION_MARGIN_BELOW_THRESHOLD"};
  if(top.score<minConfidence)return{selectedCandidate:top.candidate,selectedGroupId:top.group.groupId,candidateGroups:groups,confidence:top.score,margin,rejectedCandidates:rejected,clarificationNeeded:true,clarificationReason:top.candidate.mutatesState?"MUTATION_CONFIDENCE_BELOW_THRESHOLD":"READ_CONFIDENCE_BELOW_THRESHOLD"};
  return{selectedCandidate:top.candidate,selectedGroupId:top.group.groupId,candidateGroups:groups,confidence:top.score,margin,rejectedCandidates:rejected,clarificationNeeded:false};
 }
}
function deterministicScore(candidate:DecisionCandidate){if(candidate.source==="exact"||candidate.source==="filesystem")return 1;if(candidate.source==="web")return .85;if(candidate.source==="hybrid")return .65;if(candidate.source==="planner")return .5;if(candidate.source==="intent_memory")return .2;return .35;}
function contextConfidence(context?:ContextEvidence[]){if(!context?.length)return 1;return context.reduce((sum,item)=>sum+item.confidence,0)/context.length;}
function key(candidate:DecisionCandidate){return`${candidate.source}:${candidate.proposedTool??candidate.operation}`;}
function round(value:number){return Math.round(value*1000)/1000;}

function verifiedMemoryScore(candidate:DecisionCandidate,supporting?:DecisionCandidate[]){
  let best=0;
  for(const item of supporting??[]){
    if(item.source!=="intent_memory"||item.operation!==candidate.operation||!compatibleDomainEvidence(item.domain,candidate.domain))continue;
    best=Math.max(best,item.confidence);
  }
  return best;
}

function plannerSupportScore(candidate:DecisionCandidate,supporting?:DecisionCandidate[]){
 let best=0;for(const item of supporting??[]){if(item.source!=="planner"||item.operation!==candidate.operation||!compatibleDomainEvidence(item.domain,candidate.domain))continue;best=Math.max(best,item.confidence);}return best;
}

function sourceDomainFloor(candidate:DecisionCandidate){return candidate.source==="exact"||candidate.source==="filesystem"?1:candidate.source==="hybrid"?.9:candidate.source==="web"?.9:candidate.source==="planner"?.65:0;}
