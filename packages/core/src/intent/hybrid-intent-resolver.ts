import type { LocalMetricsService } from "../observability/metrics.js";
import { evaluateIntentConfidence } from "./confidence-evaluator.js";
import type { IntentParser } from "./llm-intent-parser.js";
import type { IntentParserFailureKind } from "./parser-result.js";
import { validateCanonicalIntent } from "./intent-validator.js";
import { validateIntentSemantics } from "./semantic-validator.js";
import type { CanonicalIntent, IntentResolutionInput, IntentResolutionResult } from "./types.js";

export type HybridResolverDiagnostics={
  input:string;
  model?:string;
  status:string;
  operation?:string;
  entities?:Record<string,unknown>;
  missing?:string[];
  modelDeclaredMissing?:string[];
  coreDerivedMissing?:string[];
  ambiguities?:Array<{code:string;field?:string;message:string;critical?:boolean}>;
  confidence?:number;
  reason?:string;
  latencyMs:number;
  parserMs:number;
  validationMs:number;
  parser?:{
    status:"success"|"failure";
    failureKind?:IntentParserFailureKind;
    model?:string;
    latencyMs?:number;
  };
  validation?:{
    structural:"valid"|"invalid";
    semantic:"valid"|"invalid";
    missing?:string[];
    ambiguities?:string[];
  };
};

export class HybridIntentResolver{
  private consecutiveFailures=0;
  private circuitOpenUntil=0;
  private last?:HybridResolverDiagnostics;

  constructor(private readonly parser:IntentParser,private readonly metrics?:LocalMetricsService,private readonly failureThreshold=5,private readonly cooldownMs=60_000){}

  async resolve(input:IntentResolutionInput):Promise<IntentResolutionResult>{
    const started=Date.now();
    this.metrics?.record("intent.resolve.total",1,{domain:"filesystem"});
    if(Date.now()<this.circuitOpenUntil)return this.finish(input,"unknown",started,{status:"unknown",reason:"HYBRID_INTENT_CIRCUIT_OPEN"},{parserMs:0,validationMs:0});

    const parserStarted=Date.now();
    const rawParsed=await this.parser.parse(input) as unknown;
    const parsed=normalizeParserResult(rawParsed,Date.now()-parserStarted,this.parser.modelName?.());
    const parserMs=parsed.latencyMs;
    if(parsed.status==="failure"){
      if(parsed.kind!=="ABORTED")this.registerFailure();
      this.metrics?.record(parserMetric(parsed.kind),1,{domain:"filesystem"});
      return this.finish(
        input,
        "unknown",
        started,
        {status:"unknown",reason:parserReason(parsed.kind)},
        {parserMs,validationMs:0,parser:{status:"failure",failureKind:parsed.kind,model:parsed.model,latencyMs:parsed.latencyMs}}
      );
    }

    this.metrics?.record("intent.parser.success",1,{domain:"filesystem"});
    const intent=parsed.intent;
    const validationStarted=Date.now();
    const preliminary=validateIntentSemantics(intent,input.text);
    if(preliminary.reason==="INFORMATIONAL_REQUEST"||preliminary.reason==="NEGATED_ACTION"){
      this.metrics?.record("intent.validation.semantic_invalid",1,{reason:preliminary.reason});
      return this.finish(
        input,"unknown",started,{status:"unknown",reason:preliminary.reason,intent},
        {parserMs,validationMs:Date.now()-validationStarted,parser:{status:"success",model:parsed.model,latencyMs:parsed.latencyMs},validation:{structural:"valid",semantic:"invalid",missing:preliminary.missing,ambiguities:preliminary.ambiguities.map(item=>item.code)}}
      );
    }

    const structural=validateCanonicalIntent(intent,input.availableOperations);
    if(!structural.valid){
      this.registerFailure();
      this.metrics?.record("intent.validation.schema_invalid",1,{code:structural.code});
      return this.finish(
        input,"unknown",started,{status:"unknown",reason:structural.code,intent},
        {parserMs,validationMs:Date.now()-validationStarted,parser:{status:"success",model:parsed.model,latencyMs:parsed.latencyMs},validation:{structural:"invalid",semantic:"invalid"}}
      );
    }

    this.consecutiveFailures=0;
    const semantic=validateIntentSemantics(structural.intent,input.text);
    const confidence=evaluateIntentConfidence(semantic.intent,semantic);
    if(semantic.missing.length)this.metrics?.record("intent.entity.missing",semantic.missing.length,{operation:intent.operation});
    if(semantic.ambiguities.length)this.metrics?.record("intent.entity.ambiguous",semantic.ambiguities.length,{operation:intent.operation});
    if(!semantic.valid)this.metrics?.record("intent.validation.semantic_invalid",1,{reason:semantic.reason??"unknown"});
    if(intent.diagnostics?.modelDeclaredMissing){
      for(const field of intent.diagnostics.modelDeclaredMissing){
        if(!semantic.missing.includes(field)){
          this.metrics?.record("intent.model_missing.disagreement",1,{operation:intent.operation,field});
        }
      }
    }
    const timing=()=>({
      parserMs,
      validationMs:Date.now()-validationStarted,
      parser:{status:"success" as const,model:parsed.model,latencyMs:parsed.latencyMs},
      validation:{structural:"valid" as const,semantic:semantic.valid?"valid" as const:"invalid" as const,missing:semantic.missing,ambiguities:semantic.ambiguities.map(item=>item.code)}
    });

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

  private finish(
    input:IntentResolutionInput,
    status:string,
    started:number,
    result:IntentResolutionResult,
    timing:{
      parserMs:number;
      validationMs:number;
      parser?:HybridResolverDiagnostics["parser"];
      validation?:HybridResolverDiagnostics["validation"];
    }
  ){
    const latencyMs=Date.now()-started;
    this.metrics?.record("intent.resolve.latency_ms",latencyMs,{status});
    if(status==="unknown")this.metrics?.record("intent.resolve.unknown",1,{reason:result.status==="unknown"?result.reason:"unknown"});
    const intent="intent" in result?result.intent:undefined;
    this.last={
      input:input.text,
      model:timing.parser?.model??this.parser.modelName?.(),
      status,
      operation:intent?.operation,
      entities:intent?Object.fromEntries(Object.entries(intent.entities).map(([key,value])=>[key,value.value])):undefined,
      missing:intent?.missing,
      modelDeclaredMissing:intent?.diagnostics?.modelDeclaredMissing,
      coreDerivedMissing:intent?.diagnostics?.coreDerivedMissing??intent?.missing,
      ambiguities:intent?.ambiguities,
      confidence:"confidence" in result?result.confidence?.overall:undefined,
      latencyMs,
      parserMs:timing.parserMs,
      validationMs:timing.validationMs,
      parser:timing.parser,
      validation:timing.validation,
      reason:result.status==="unknown"?result.reason:undefined
    };
    return result;
  }
}

function parserMetric(kind:IntentParserFailureKind){
  return{
    TIMEOUT:"intent.parser.timeout",
    ABORTED:"intent.parser.aborted",
    MODEL_UNAVAILABLE:"intent.parser.model_unavailable",
    MODEL_NOT_FOUND:"intent.parser.model_not_found",
    TRANSPORT_ERROR:"intent.parser.transport_error",
    INVALID_JSON:"intent.parser.invalid_json",
    STRUCTURED_OUTPUT_ERROR:"intent.parser.structured_output_error",
    SCHEMA_VALIDATION_ERROR:"intent.parser.schema_validation_error",
    UNKNOWN_ERROR:"intent.parser.unknown_error"
  }[kind];
}

function parserReason(kind:IntentParserFailureKind){
  return`LLM_INTENT_${kind}`;
}

function normalizeParserResult(value:unknown,latencyMs:number,model?:string){
  if(value&&typeof value==="object"&&"status" in value){
    const status=(value as any).status;
    if(status==="success"||status==="failure")return value as import("./parser-result.js").IntentParserResult;
  }
  if(value&&typeof value==="object"&&(value as CanonicalIntent).schemaVersion===1&&typeof (value as CanonicalIntent).operation==="string"){
    return{status:"success" as const,intent:value as CanonicalIntent,latencyMs,model};
  }
  return{status:"failure" as const,kind:"UNKNOWN_ERROR" as const,latencyMs,model,diagnosticCode:"LEGACY_PARSER_EMPTY_RESULT"};
}
