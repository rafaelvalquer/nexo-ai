import { describe,expect,it } from "vitest";
import { HybridIntentResolver } from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";
import type { IntentParserResult } from "../../../packages/core/src/intent/parser-result.js";

const canonical=(operation:string,modelConfidence=.99,entities?:CanonicalIntent["entities"]):CanonicalIntent=>({
  schemaVersion:1,domain:"filesystem",intent:operation==="create_folder"?"create":"update",operation,
  entities:entities??(operation==="create_folder"?{name:{value:"teste",source:"user",confidence:.99},folder:{value:"downloads",source:"user",confidence:.99}}:{file:{value:"teste.txt",source:"user",confidence:.99},content:{value:"abc",source:"user",confidence:.99}}),
  referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:modelConfidence,resolverVersion:"test"}
});
const success=(intent:CanonicalIntent):IntentParserResult=>({status:"success",intent,latencyMs:3,model:"qwen-test"});

describe("HybridIntentResolver",()=>{
  it("resolve uma intenção válida com alta confiança",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>success(canonical("create_folder"))});
    const result=await resolver.resolve({text:"faz uma pastinha teste nos meus downloads",availableOperations:["create_folder"]});
    expect(result.status).toBe("resolved");
    if(result.status==="resolved")expect(result.confidence.overall).toBeGreaterThanOrEqual(.9);
  });

  it("expõe diagnostics V3 de parser e validação",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>success(canonical("create_folder")),modelName:()=>"qwen-test"});
    await resolver.resolve({text:"faz uma pasta teste em downloads",availableOperations:["create_folder"]});
    expect(resolver.diagnostics()).toMatchObject({
      model:"qwen-test",status:"resolved",operation:"create_folder",
      entities:{name:"teste",folder:"downloads"},
      parser:{status:"success",model:"qwen-test",latencyMs:3},
      validation:{structural:"valid",semantic:"valid",missing:[],ambiguities:[]},
      parserMs:3,validationMs:expect.any(Number),latencyMs:expect.any(Number)
    });
  });

  it("rejeita operação que não está na allowlist",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>success(canonical("write_text_file"))});
    const result=await resolver.resolve({text:"altere teste.txt para abc",availableOperations:["create_folder"]});
    expect(result).toMatchObject({status:"unknown",reason:"INVALID_INTENT_OPERATION"});
    expect(resolver.diagnostics()?.validation?.structural).toBe("invalid");
  });

  it("propaga taxonomy de timeout sem contar como schema inválido",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>({status:"failure",kind:"TIMEOUT",latencyMs:1000,model:"qwen-test"})});
    const result=await resolver.resolve({text:"crie uma pasta teste",availableOperations:["create_folder"]});
    expect(result).toEqual({status:"unknown",reason:"LLM_INTENT_TIMEOUT"});
    expect(resolver.diagnostics()?.parser).toMatchObject({status:"failure",failureKind:"TIMEOUT"});
  });

  it("Core deriva missing quando a LLM omite folder",async()=>{
    const intent=canonical("create_folder",.99,{name:{value:"teste",source:"user",confidence:.99}});
    const resolver=new HybridIntentResolver({parse:async()=>success(intent)});
    const result=await resolver.resolve({text:"crie uma pasta teste",availableOperations:["create_folder"]});
    expect(result.status).toBe("clarification");
    if(result.status==="clarification"){
      expect(result.intent.missing).toContain("folder");
      expect(result.question).toContain("Em qual pasta");
    }
  });
  it("records model_only when the model declares missing but Core finds the entity",async()=>{
    const records:Array<{metric:string;tags?:Record<string,unknown>}>= [];
    const intent=canonical("create_folder");
    intent.missing=["folder"];
    const resolver=new HybridIntentResolver(
      {parse:async()=>success(intent)},
      {record:(metric:string,_value:number,tags?:Record<string,unknown>)=>records.push({metric,tags})} as any
    );

    await resolver.resolve({text:"crie uma pasta teste em downloads",availableOperations:["create_folder"]});

    expect(records).toContainEqual(expect.objectContaining({
      metric:"intent.model_missing.disagreement",
      tags:expect.objectContaining({field:"folder",direction:"model_only"})
    }));
  });

  it("records core_only when Core derives a missing entity omitted by the model",async()=>{
    const records:Array<{metric:string;tags?:Record<string,unknown>}>= [];
    const intent=canonical("create_folder",.99,{name:{value:"teste",source:"user",confidence:.99}});
    const resolver=new HybridIntentResolver(
      {parse:async()=>success(intent)},
      {record:(metric:string,_value:number,tags?:Record<string,unknown>)=>records.push({metric,tags})} as any
    );

    await resolver.resolve({text:"crie uma pasta teste",availableOperations:["create_folder"]});

    expect(records).toContainEqual(expect.objectContaining({
      metric:"intent.model_missing.disagreement",
      tags:expect.objectContaining({field:"folder",direction:"core_only"})
    }));
  });

});
