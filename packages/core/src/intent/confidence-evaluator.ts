import type {CanonicalIntent,IntentConfidence} from "./types.js";
import type {SemanticValidationResult} from "./semantic-validator.js";

export type DecisionConfidenceInput={domainConsistency?:number;operationScore:number;entityCompleteness:number;contextConfidence:number;goalScore:number;deterministicEvidence?:number;verifiedMemory?:number;schemaValidity?:number;semanticValidity?:number;ambiguityCount:number;conflictCount:number;failurePenalty?:number;mutatesState?:boolean};
export type DecisionConfidence={domain:number;operation:number;entities:number;context:number;goal:number;deterministic:number;memory:number;validation:number;ambiguityPenalty:number;conflictPenalty:number;failurePenalty:number;overall:number;policy:"execute"|"verify_or_clarify"|"clarify"};

export function evaluateDecisionConfidence(input:DecisionConfidenceInput):DecisionConfidence{
 const validation=clamp(((input.schemaValidity??1)+(input.semanticValidity??1))/2);
 const domain=clamp(input.domainConsistency??validation),operation=clamp(input.operationScore),entities=clamp(input.entityCompleteness),context=clamp(input.contextConfidence),goal=clamp(input.goalScore),deterministic=clamp(input.deterministicEvidence??0),memory=clamp(input.verifiedMemory??0);
 const ambiguityPenalty=Math.min(.25,Math.max(0,input.ambiguityCount)*.05),conflictPenalty=Math.min(.35,Math.max(0,input.conflictCount)*.10),failurePenalty=Math.min(.30,Math.max(0,input.failurePenalty??0)*.10);
 const overall=round(clamp(domain*.25+operation*.20+entities*.20+goal*.20+context*.05+deterministic*.05+memory*.05-ambiguityPenalty-conflictPenalty-failurePenalty));
 const policy=input.mutatesState?(overall>=.90&&entities===1&&goal>=.9&&domain>=.8?"execute":"clarify"):(overall>=.85?"execute":overall>=.75?"verify_or_clarify":"clarify");
 return{domain:round(domain),operation:round(operation),entities:round(entities),context:round(context),goal:round(goal),deterministic:round(deterministic),memory:round(memory),validation:round(validation),ambiguityPenalty:round(ambiguityPenalty),conflictPenalty:round(conflictPenalty),failurePenalty:round(failurePenalty),overall,policy};
}

export function evaluateIntentConfidence(intent:CanonicalIntent,semantic:SemanticValidationResult):IntentConfidence{
 const requiredCount=semantic.missing.length+Object.keys(intent.entities).length,entityScore=requiredCount===0?1:Math.max(0,1-semantic.missing.length/requiredCount),operationScore=intent.operation!=="unknown"?Math.max(.5,Math.min(1,intent.diagnostics?.rawModelConfidence??.8)):0,ambiguityCount=semantic.ambiguities.filter(item=>item.critical!==false).length;
 const decision=evaluateDecisionConfidence({domainConsistency:intent.domain!=="unknown"?1:0,operationScore,entityCompleteness:entityScore,contextConfidence:contextScore(intent),goalScore:semantic.valid?1:.5,deterministicEvidence:intent.source==="deterministic"?1:0,verifiedMemory:0,schemaValidity:1,semanticValidity:semantic.valid?1:0,ambiguityCount,conflictCount:0,mutatesState:["create","update","delete"].includes(intent.intent)});
 return{schema:1,semantic:round(decision.validation),entities:round(entityScore),ambiguity:ambiguityCount?0:round(Math.max(0,1-decision.ambiguityPenalty)),overall:decision.overall};
}
function contextScore(intent:CanonicalIntent){const entities=Object.values(intent.entities);if(!entities.length)return 1;const values=entities.map(entity=>entity.source==="user"?1:entity.source==="semantic_alias"?0.9:entity.source==="previous_context"?0.85:entity.source==="inferred"?0.5:0.7);return values.reduce((sum,value)=>sum+value,0)/values.length;}
function clamp(value:number){return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function round(value:number){return Math.round(value*1000)/1000;}
