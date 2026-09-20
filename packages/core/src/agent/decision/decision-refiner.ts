import type {ContextEvidence,DecisionCandidate} from "./types.js";
import type {GoalSatisfaction} from "./goal-satisfaction.js";
import {DomainEvidenceBuilder} from "../../intent/domain/domain-evidence-builder.js";
import {GlobalDecisionArbiter} from "./global-decision-arbiter.js";

export type DecisionRefinement={selectedCandidate?:DecisionCandidate;confidence:number;margin?:number;rejectedCandidates:Array<{candidate:DecisionCandidate;reason:string}>;clarificationNeeded:boolean;clarificationReason?:string};

/** Compatibility façade. New routing should call GlobalDecisionArbiter with the complete candidate pool. */
export class DecisionRefiner{
 private readonly arbiter=new GlobalDecisionArbiter();
 refine(input:{current?:DecisionCandidate;alternatives?:DecisionCandidate[];context?:ContextEvidence[];goalByKey?:Map<string,GoalSatisfaction>;userText?:string;expectedDomain?:string}):DecisionRefinement{
  const candidates=[input.current,...(input.alternatives??[])].filter(Boolean) as DecisionCandidate[],text=input.userText??candidateText(candidates);
  return this.arbiter.decide({userText:text,candidates,domainEvidence:new DomainEvidenceBuilder().build(text),expectedDomain:input.expectedDomain,context:input.context,goalByKey:input.goalByKey});
 }
}
function candidateText(candidates:DecisionCandidate[]){return candidates.flatMap(candidate=>Object.values(candidate.entities)).filter(value=>typeof value==="string").join(" ")||"pedido";}
