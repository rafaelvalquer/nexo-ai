import type { CanonicalIntent, IntentConfidence } from "./types.js";
import type { SemanticValidationResult } from "./semantic-validator.js";

export type DecisionConfidenceInput={
  operationScore:number;
  entityCompleteness:number;
  contextConfidence:number;
  goalScore:number;
  schemaValidity:number;
  semanticValidity:number;
  ambiguityCount:number;
  conflictCount:number;
  mutatesState?:boolean;
};
export type DecisionConfidence={operation:number;entities:number;context:number;goal:number;validation:number;ambiguityPenalty:number;conflictPenalty:number;overall:number;policy:"execute"|"verify_or_clarify"|"clarify"};

export function evaluateDecisionConfidence(input:DecisionConfidenceInput):DecisionConfidence{
  const operation=clamp(input.operationScore),entities=clamp(input.entityCompleteness),context=clamp(input.contextConfidence),goal=clamp(input.goalScore);
  const validation=clamp((input.schemaValidity+input.semanticValidity)/2);
  const ambiguityPenalty=Math.min(.25,Math.max(0,input.ambiguityCount)*.05);
  const conflictPenalty=Math.min(.35,Math.max(0,input.conflictCount)*.10);
  const overall=round(clamp(operation*.30+entities*.25+context*.15+goal*.20+validation*.10-ambiguityPenalty-conflictPenalty));
  const policy=input.mutatesState?(overall>=.95&&entities===1&&goal>=.9&&validation>=.9?"execute":"clarify"):(overall>=.90?"execute":overall>=.75?"verify_or_clarify":"clarify");
  return{operation:round(operation),entities:round(entities),context:round(context),goal:round(goal),validation:round(validation),ambiguityPenalty:round(ambiguityPenalty),conflictPenalty:round(conflictPenalty),overall,policy};
}

export function evaluateIntentConfidence(intent:CanonicalIntent,semantic:SemanticValidationResult):IntentConfidence{
  const requiredCount=semantic.missing.length+Object.keys(intent.entities).length;
  const entityScore=requiredCount===0?1:Math.max(0,1-semantic.missing.length/requiredCount);
  const operationScore=intent.operation!=="unknown"?Math.max(.5,Math.min(1,intent.diagnostics?.rawModelConfidence??.8)):0;
  const ambiguityCount=semantic.ambiguities.filter(item=>item.critical!==false).length;
  const decision=evaluateDecisionConfidence({
    operationScore,
    entityCompleteness:entityScore,
    contextConfidence:contextScore(intent),
    goalScore:semantic.valid?1:.5,
    schemaValidity:1,
    semanticValidity:semantic.valid?1:0,
    ambiguityCount,
    conflictCount:0,
    mutatesState:["create","update","delete"].includes(intent.intent)
  });
  return{schema:1,semantic:round(decision.validation),entities:round(entityScore),ambiguity:round(Math.max(0,1-decision.ambiguityPenalty)),overall:decision.overall};
}
function contextScore(intent:CanonicalIntent){
  const entities=Object.values(intent.entities);if(!entities.length)return 1;
  const values=entities.map(entity=>entity.source==="user"?1:entity.source==="semantic_alias"?0.9:entity.source==="previous_context"?0.85:entity.source==="inferred"?0.5:0.7);
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}
function clamp(value:number){return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function round(value:number){return Math.round(value*1000)/1000;}
