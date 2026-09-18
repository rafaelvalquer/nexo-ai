import type { CanonicalIntent, IntentConfidence } from "./types.js";
import type { SemanticValidationResult } from "./semantic-validator.js";

export function evaluateIntentConfidence(intent:CanonicalIntent,semantic:SemanticValidationResult):IntentConfidence{
  const requiredCount=semantic.missing.length+Object.keys(intent.entities).length;
  const entities=requiredCount===0?1:Math.max(0,1-semantic.missing.length/requiredCount);
  const semanticScore=intent.operation!=="unknown"&&intent.domain==="filesystem"?1:0;
  const ambiguity=semantic.ambiguities.some(item=>item.critical!==false)?0:1;
  const model=Math.max(0,Math.min(1,intent.diagnostics?.rawModelConfidence??.5));
  const schema=1;
  const overall=round(schema*.20+semanticScore*.20+entities*.30+ambiguity*.20+model*.10);
  return{schema,semantic:semanticScore,entities:round(entities),ambiguity,overall};
}
function round(value:number){return Math.round(value*1000)/1000;}
