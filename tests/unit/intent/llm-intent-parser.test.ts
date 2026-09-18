import { describe,expect,it } from "vitest";
import { LLMIntentParser } from "../../../packages/core/src/intent/llm-intent-parser.js";

describe("LLMIntentParser",()=>{
  it("usa structured output e converte para CanonicalIntent",async()=>{
    const llm:any={
      planStructured:async(request:any)=>request.parse({schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:"teste",folder:"downloads"},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.98}),
      plan:async()=>{throw new Error("fallback não deveria ser usado")}
    };
    const parser=new LLMIntentParser(llm,1000);
    const result=await parser.parse({text:"faz uma pastinha teste nos meus downloads",availableOperations:["create_folder"]});
    expect(result).toMatchObject({domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:{value:"teste"},folder:{value:"downloads"}},source:"llm"});
  });

  it("retorna undefined para JSON inválido sem executar nada",async()=>{
    const llm:any={planStructured:async()=>{throw new Error("invalid")}};
    const parser=new LLMIntentParser(llm,1000);
    await expect(parser.parse({text:"qualquer coisa",availableOperations:["create_folder"]})).resolves.toBeUndefined();
  });
});
