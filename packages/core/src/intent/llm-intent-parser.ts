import type { LLMProvider } from "../llm/provider.js";
import { stripCodeFence } from "../security/prompt.js";
import { normalizeIntentInput } from "./input-normalizer.js";
import { modelIntentJsonSchema, parseModelIntent, toCanonicalIntent } from "./schema.js";
import { HYBRID_INTENT_SYSTEM_PROMPT } from "./prompts/system.js";
import { filesystemIntentPrompt } from "./prompts/filesystem.js";
import type { CanonicalIntent, IntentResolutionInput } from "./types.js";

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
        return toCanonicalIntent(parsed);
      }
      const raw=await this.llm.plan(messages,signal);
      return toCanonicalIntent(parseModelIntent(JSON.parse(stripCodeFence(raw))));
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
