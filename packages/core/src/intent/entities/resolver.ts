import {deriveMissingFields} from "../operation-requirements.js";
import {literalEntities,normalizeEntityValue} from "./normalizer.js";
import {provenancePriority,type EntityProvenance,type ResolvedIntentEntity} from "./provenance.js";
import {validateResolvedEntities} from "./validator.js";
export type EntityResolutionInput={operation:string;text:string;llmEntities?:Record<string,unknown>;clarificationEntities?:Record<string,unknown>;currentTurnEntities?:Record<string,unknown>;contextEntities?:Record<string,{value:unknown;source:EntityProvenance;confidence:number}>;memoryEntities?:Record<string,unknown>};
export type EntityResolution={entities:Record<string,ResolvedIntentEntity>;missing:string[];rejected:string[]};
export class EntityResolverV2{
  resolve(input:EntityResolutionInput):EntityResolution{
    const out:Record<string,ResolvedIntentEntity>={};
    const merge=(source:EntityProvenance,values:Record<string,unknown>|undefined,confidence:number)=>{for(const [key,raw] of Object.entries(values??{})){if(raw===undefined||raw===null||raw==="")continue;const next={value:normalizeEntityValue(key,raw),source,confidence};const current=out[key];if(!current||provenancePriority[source]>=provenancePriority[current.source])out[key]=next;}};
    merge("intent_memory",input.memoryEntities,.55);
    merge("conversation_history",input.llmEntities,.72);
    if(input.contextEntities)for(const [key,value] of Object.entries(input.contextEntities)){const current=out[key];if(!current||provenancePriority[value.source]>=provenancePriority[current.source])out[key]={...value,value:normalizeEntityValue(key,value.value)};}
    merge("current_turn",input.currentTurnEntities,.9);
    merge("clarification",input.clarificationEntities,.98);
    merge("user",literalEntities(input.text),1);
    const checked=validateResolvedEntities(input.operation,out);
    const canonical=Object.fromEntries(Object.entries(checked.entities).map(([key,value])=>[key,{value:value.value,source:"user" as const,confidence:value.confidence}]));
    const missing=deriveMissingFields(input.operation,canonical as any);
    return{entities:checked.entities,missing,rejected:checked.rejected};
  }
}
