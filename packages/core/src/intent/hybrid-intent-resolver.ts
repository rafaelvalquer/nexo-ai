import type { LocalMetricsService } from "../observability/metrics.js";
import { evaluateIntentConfidence } from "./confidence-evaluator.js";
import type { IntentParser } from "./llm-intent-parser.js";
import { validateCanonicalIntent } from "./intent-validator.js";
import { validateIntentSemantics } from "./semantic-validator.js";
import type { IntentResolutionInput, IntentResolutionResult } from "./types.js";

export type HybridResolverDiagnostics={
  input:string;
  model?:string;
  status:string;
  operation?:string;
  entities?:Record<string,unknown>;
  missing?:string[];
  ambiguities?:Array<{code:string;field?:string;message:string;critical?:boolean}>;
  confidence?:number;
  reason?:string;
  latencyMs:number;
  parserMs:number;
  validationMs:number;
};

export class HybridIntentResolver{
  private consecutiveFailures=0;
  private circuitOpenUntil=0;
  private last?:HybridResolverDiagnostics;

  constructor(private readonly parser:IntentParser,private readonly metrics?:LocalMetricsService,private readonly failureThreshold=5,private readonly cooldownMs=60_000){}

  async resolve(input:IntentResolutionInput):Promise<IntentResolutionResult>{
    const started=Date.now();
    let parserMs=0,validationStarted=started;
    this.metrics?.record("intent.resolve.total",1,{domain:"filesystem"});
    if(Date.now()<this.circuitOpenUntil)return this.finish(input,"unknown",started,{status:"unknown",reason:"HYBRID_INTENT_CIRCUIT_OPEN"},{parserMs:0,validationMs:0});

    const parserStarted=Date.now();
    const intent=await this.parser.parse(input).catch(()=>undefined);
    parserMs=Date.now()-parserStarted;
    if(!intent){
      this.registerFailure();
      this.metrics?.record("intent.schema.invalid",1,{domain:"filesystem"});
      return this.finish(input,"unknown",started,{status:"unknown",reason:"LLM_INTENT_PARSE_FAILED"},{parserMs,validationMs:0});
    }

    validationStarted=Date.now();
    const preliminary=validateIntentSemantics(intent,input.text);
    if(preliminary.reason==="INFORMATIONAL_REQUEST"||preliminary.reason==="NEGATED_ACTION"){
      return this.finish(input,"unknown",started,{status:"unknown",reason:preliminary.reason,intent},{parserMs,validationMs:Date.now()-validationStarted});
    }

    const structural=validateCanonicalIntent(intent,input.availableOperations);
    if(!structural.valid){
      this.registerFailure();
      this.metrics?.record(structural.code==="INVALID_INTENT_OPERATION"?"intent.operation.invalid":"intent.schema.invalid",1,{domain:"filesystem"});
      return this.finish(input,"unknown",started,{status:"unknown",reason:structural.code,intent},{parserMs,validationMs:Date.now()-validationStarted});
    }

    this.consecutiveFailures=0;
    const semantic=validateIntentSemantics(structural.intent,input.text);
    const confidence=evaluateIntentConfidence(semantic.intent,semantic);
    if(semantic.missing.length)this.metrics?.record("intent.entity.missing",semantic.missing.length,{operation:intent.operation});
    if(semantic.ambiguities.length)this.metrics?.record("intent.entity.ambiguous",semantic.ambiguities.length,{operation:intent.operation});
    const timing=()=>({parserMs,validationMs:Date.now()-validationStarted});

    if(!semantic.valid){
      if(semantic.question){
        this.metrics?.record("intent.resolve.clarification",1,{operation:intent.operation});
        return this.finish(input,"clarification",started,{status:"clarification",intent:semantic.intent,confidence,question:semantic.question},timing());
      }
      return this.finish(input,"unknown",started,{status:"unknown",reason:semantic.reason??"SEMANTIC_VALIDATION_FAILED",intent:semantic.intent,confidence},timing());
    }

    if(confidence.overall<.70)return this.finish(input,"unknown",started,{status:"unknown",reason:"LOW_CONFIDENCE",intent:semantic.intent,confidence},timing());
    if(confidence.overall<.90){
      const question="Entendi parcialmente a solicitação, mas preciso que você detalhe o arquivo, pasta ou ação antes de executar.";
      this.metrics?.record("intent.resolve.clarification",1,{operation:intent.operation});
      return this.finish(input,"clarification",started,{status:"clarification",intent:semantic.intent,confidence,question},timing());
    }

    this.metrics?.record("intent.resolve.llm",1,{operation:intent.operation});
    return this.finish(input,"resolved",started,{status:"resolved",intent:semantic.intent,confidence},timing());
  }

  diagnostics(){return this.last?structuredClone(this.last):undefined;}

  private registerFailure(){
    this.consecutiveFailures++;
    if(this.consecutiveFailures>=this.failureThreshold){
      this.circuitOpenUntil=Date.now()+this.cooldownMs;
      this.consecutiveFailures=0;
    }
  }

  private finish(input:IntentResolutionInput,status:string,started:number,result:IntentResolutionResult,timing:{parserMs:number;validationMs:number}){
    const latencyMs=Date.now()-started;
    this.metrics?.record("intent.resolve.latency_ms",latencyMs,{status});
    if(status==="unknown")this.metrics?.record("intent.resolve.unknown",1,{reason:result.status==="unknown"?result.reason:"unknown"});
    const intent="intent" in result?result.intent:undefined;
    this.last={
      input:input.text,
      model:this.parser.modelName?.(),
      status,
      operation:intent?.operation,
      entities:intent?Object.fromEntries(Object.entries(intent.entities).map(([key,value])=>[key,value.value])):undefined,
      missing:intent?.missing,
      ambiguities:intent?.ambiguities,
      confidence:"confidence" in result?result.confidence?.overall:undefined,
      latencyMs,
      parserMs:timing.parserMs,
      validationMs:timing.validationMs,
      reason:result.status==="unknown"?result.reason:undefined
    };
    return result;
  }
}
