import { describe,expect,it } from "vitest";
import { HybridIntentResolver } from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";

const canonical=(operation:string,modelConfidence=.99):CanonicalIntent=>({
  schemaVersion:1,domain:"filesystem",intent:operation==="create_folder"?"create":"update",operation,
  entities:operation==="create_folder"?{name:{value:"teste",source:"user",confidence:.99},folder:{value:"downloads",source:"user",confidence:.99}}:{file:{value:"teste.txt",source:"user",confidence:.99},content:{value:"abc",source:"user",confidence:.99}},
  referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:modelConfidence,resolverVersion:"test"}
});

describe("HybridIntentResolver",()=>{
  it("resolve uma intenção válida com alta confiança",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>canonical("create_folder")});
    const result=await resolver.resolve({text:"faz uma pastinha teste nos meus downloads",availableOperations:["create_folder"]});
    expect(result.status).toBe("resolved");
    if(result.status==="resolved")expect(result.confidence.overall).toBeGreaterThanOrEqual(.9);
  });

  it("expõe diagnostics de parser e validação sem perder entidades",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>canonical("create_folder"),modelName:()=>"qwen-test"});
    await resolver.resolve({text:"faz uma pasta teste em downloads",availableOperations:["create_folder"]});
    expect(resolver.diagnostics()).toMatchObject({
      model:"qwen-test",status:"resolved",operation:"create_folder",
      entities:{name:"teste",folder:"downloads"},
      missing:[],ambiguities:[],confidence:expect.any(Number),
      parserMs:expect.any(Number),validationMs:expect.any(Number),latencyMs:expect.any(Number)
    });
  });

  it("rejeita operação que não está na allowlist",async()=>{
    const resolver=new HybridIntentResolver({parse:async()=>canonical("write_text_file")});
    const result=await resolver.resolve({text:"altere teste.txt para abc",availableOperations:["create_folder"]});
    expect(result).toMatchObject({status:"unknown",reason:"INVALID_INTENT_OPERATION"});
  });
});
