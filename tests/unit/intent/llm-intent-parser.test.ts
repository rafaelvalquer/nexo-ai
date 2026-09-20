import { describe,expect,it } from "vitest";
import { z } from "zod";
import { LLMIntentParser } from "../../../packages/core/src/intent/llm-intent-parser.js";
import { OllamaConnectionError, OllamaModelNotFoundError, OllamaTimeoutError } from "../../../packages/core/src/llm/errors.js";
import { StructuredOutputError } from "../../../packages/core/src/llm/structured-response-parser.js";

const request={text:"faz uma pastinha teste nos meus downloads",availableOperations:["create_folder"]};

describe("LLMIntentParser",()=>{
  it("usa structured output e converte para CanonicalIntent",async()=>{
    const llm:any={
      planStructured:async(input:any)=>input.parse({schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:"teste",folder:"downloads"},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.98}),
      plan:async()=>{throw new Error("fallback não deveria ser usado")},
      intentModelName:()=>"qwen-test"
    };
    const result=await new LLMIntentParser(llm,1000).parse(request);
    expect(result.status).toBe("success");
    if(result.status==="success"){
      expect(result.intent).toMatchObject({domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:{value:"teste"},folder:{value:"downloads"}},source:"llm"});
      expect(result.model).toBe("qwen-test");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("classifica alias normalizado como semantic_alias",async()=>{
    const llm:any={planStructured:async(input:any)=>input.parse({schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:"teste",folder:"downloads"},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.98})};
    const result=await new LLMIntentParser(llm,1000).parse({text:"faz uma pasta teste no download",availableOperations:["create_folder"]});
    expect(result.status).toBe("success");
    if(result.status==="success"){
      expect(result.intent.entities.name.source).toBe("user");
      expect(result.intent.entities.folder.source).toBe("semantic_alias");
    }
  });

  it.each([
    ["TIMEOUT",new OllamaTimeoutError("intent","qwen",1)],
    ["MODEL_UNAVAILABLE",new OllamaConnectionError()],
    ["MODEL_NOT_FOUND",new OllamaModelNotFoundError("missing-model")],
    ["STRUCTURED_OUTPUT_ERROR",new StructuredOutputError("invalid","text")],
    ["INVALID_JSON",new StructuredOutputError("invalid","json")],
    ["SCHEMA_VALIDATION_ERROR",new z.ZodError([])]
  ] as const)("classifica falha %s sem colapsar em parse failed",async(kind,error)=>{
    const llm:any={planStructured:async()=>{throw error;}};
    const result=await new LLMIntentParser(llm,1000).parse(request);
    expect(result).toMatchObject({status:"failure",kind});
  });

  it("classifica abort externo separadamente",async()=>{
    const controller=new AbortController();controller.abort(new DOMException("cancelado","AbortError"));
    const llm:any={planStructured:async()=>{throw controller.signal.reason;}};
    const result=await new LLMIntentParser(llm,1000).parse({...request,signal:controller.signal});
    expect(result).toMatchObject({status:"failure",kind:"ABORTED"});
  });

  it("classifica JSON inválido no fallback sem executar nada",async()=>{
    const llm:any={plan:async()=>"{ isto não é json"};
    const result=await new LLMIntentParser(llm,1000).parse(request);
    expect(result).toMatchObject({status:"failure",kind:"INVALID_JSON"});
  });
});
