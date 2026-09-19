import type { LLMProvider } from "../llm/provider.js";
import { stripCodeFence } from "../security/prompt.js";
import { normalizeIntentInput } from "./input-normalizer.js";
import { modelIntentJsonSchema, parseModelIntent, toCanonicalIntent } from "./schema.js";
import { HYBRID_INTENT_SYSTEM_PROMPT } from "./prompts/system.js";
import { filesystemIntentPrompt } from "./prompts/filesystem.js";
import type { CanonicalIntent, IntentEntitySource, IntentResolutionInput, NormalizedIntentInput } from "./types.js";

export interface IntentParser {
  parse(input:IntentResolutionInput):Promise<CanonicalIntent|undefined>;
}

export class LLMIntentParser implements IntentParser{
  constructor(private readonly llm:LLMProvider,private readonly timeoutMs=4_500){}

  async parse(input:IntentResolutionInput):Promise<CanonicalIntent|undefined>{
    const normalized=normalizeIntentInput(input.text);
    const signal=timeoutSignal(input.signal,this.timeoutMs);
    try{
      const messages=[
        {role:"system" as const,content:HYBRID_INTENT_SYSTEM_PROMPT},
        {role:"user" as const,content:filesystemIntentPrompt(normalized,input.availableOperations)}
      ];
      if(this.llm.planStructured){
        const parsed=await this.llm.planStructured({
          messages,
          schema:modelIntentJsonSchema,
          schemaName:"NexoHybridIntentV1",
          parse:value=>parseModelIntent(value)
        },signal);
        return applyLiteralEntities(applyEntityProvenance(toCanonicalIntent(parsed),normalized.routingText),normalized);
      }
      const raw=await this.llm.plan(messages,signal);
      return applyLiteralEntities(applyEntityProvenance(toCanonicalIntent(parseModelIntent(JSON.parse(stripCodeFence(raw)))),normalized.routingText),normalized);
    }catch(error){
      if(input.signal?.aborted)throw input.signal.reason??error;
      return undefined;
    }
  }
}

function timeoutSignal(parent:AbortSignal|undefined,timeoutMs:number){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new DOMException("Hybrid intent timeout","TimeoutError")),timeoutMs);
  timer.unref?.();
  if(parent){
    if(parent.aborted)controller.abort(parent.reason);
    else parent.addEventListener("abort",()=>controller.abort(parent.reason),{once:true});
  }
  controller.signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
  return controller.signal;
}


function applyEntityProvenance(intent:CanonicalIntent,input:string):CanonicalIntent{
  const comparable=fold(input);
  const entities=Object.fromEntries(Object.entries(intent.entities).map(([key,entity])=>{
    const values=Array.isArray(entity.value)?entity.value:[entity.value];
    const literal=values.every(value=>typeof value!=="string"||containsLiteral(comparable,value));
    const semanticAlias=key==="folder"&&values.length===1&&typeof values[0]==="string"&&locationAliasMentioned(input,values[0]);
    const source:IntentEntitySource=literal?"user":semanticAlias?"semantic_alias":intent.referencesPreviousResult?"previous_context":"inferred";
    return[key,{...entity,source}];
  }));
  return{...intent,entities};
}

function containsLiteral(comparableInput:string,value:string){
  const candidate=fold(value);
  return Boolean(candidate)&&comparableInput.includes(candidate);
}

function locationAliasMentioned(input:string,value:string){
  const expected=canonicalLocation(value);if(!expected)return false;
  const words=fold(input);
  if(expected==="downloads")return /\b(?:download|downloads|baixado|baixados)\b/.test(words);
  if(expected==="documents")return /\b(?:document|documents|documento|documentos)\b/.test(words);
  if(expected==="desktop")return /\bdesktop\b|\barea de trabalho\b/.test(words);
  return false;
}

function canonicalLocation(value:string){
  const normalized=fold(value);
  if(["download","downloads","meus downloads","pasta download","pasta downloads","baixado","baixados"].includes(normalized))return"downloads";
  if(["document","documents","documento","documentos","meus documentos"].includes(normalized))return"documents";
  if(["desktop","area de trabalho"].includes(normalized))return"desktop";
  return undefined;
}

function fold(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/\s+/g," ").trim();
}


function applyLiteralEntities(intent:CanonicalIntent,input:NormalizedIntentInput):CanonicalIntent{
  if(intent.operation!=="write_text_file"&&intent.operation!=="create_text_file")return intent;
  const literal=input.literalSegments.find(segment=>segment.type==="content");
  if(!literal)return intent;
  return{...intent,entities:{...intent.entities,content:{value:literal.value,source:"user",confidence:1}}};
}
