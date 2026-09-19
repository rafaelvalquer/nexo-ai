import {describe,expect,it} from "vitest";
import {validateCanonicalIntent} from "../../../packages/core/src/intent/intent-validator.js";
import type {CanonicalIntent} from "../../../packages/core/src/intent/types.js";

function make(overrides:Partial<CanonicalIntent>={}):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:{value:"teste",source:"user"},folder:{value:"downloads",source:"user"}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{resolverVersion:"test"},...overrides};
}

describe("validateCanonicalIntent",()=>{
  it("aceita somente operação filesystem disponível na allowlist",()=>{
    expect(validateCanonicalIntent(make(),["create_folder"])).toEqual({valid:true,intent:make()});
  });
  it("rejeita operação inventada pela LLM",()=>{
    expect(validateCanonicalIntent(make({operation:"format_disk"}),["create_folder"])).toMatchObject({valid:false,code:"INVALID_INTENT_OPERATION"});
  });
  it("rejeita domínio fora do escopo da Fase 1",()=>{
    expect(validateCanonicalIntent(make({domain:"email"}),["create_folder"])).toMatchObject({valid:false,code:"INVALID_INTENT_DOMAIN"});
  });
});
