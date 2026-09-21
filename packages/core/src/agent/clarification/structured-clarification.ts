import {randomUUID} from "node:crypto";
import type {ClarificationOption,ClarificationType,StructuredClarification} from "./clarification-types.js";

export function createStructuredClarification(input:{type:ClarificationType;question:string;options:ClarificationOption[];allowFreeText?:boolean;originalRequest:string;ttlMs?:number}):StructuredClarification{
  const options=dedupeOptions(input.options);
  if(input.type!=="MISSING_ENTITY"&&options.length<2)throw new Error("Structured Clarification exige duas escolhas semanticamente diferentes.");
  return{
    id:randomUUID(),
    type:input.type,
    question:input.question,
    options,
    allowFreeText:input.allowFreeText??input.type==="MISSING_ENTITY",
    originalRequest:input.originalRequest,
    expiresAt:new Date(Date.now()+(input.ttlMs??7*24*60*60*1000)).toISOString()
  };
}
function dedupeOptions(options:ClarificationOption[]){
  const seen=new Set<string>();
  return options.filter(option=>{
    const key=option.candidateId??`${option.action?.domain??""}:${option.action?.operation??""}:${option.action?.proposedTool??""}:${option.metadata?.path??""}:${option.label}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
