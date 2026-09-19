import {describe,expect,it} from "vitest";
import {validateIntentSemantics} from "../../../packages/core/src/intent/semantic-validator.js";
import type {CanonicalIntent} from "../../../packages/core/src/intent/types.js";

function write(path:string):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent:"update",operation:"write_text_file",entities:{path:{value:path,source:"user"},content:{value:"abc",source:"user"}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
}

describe("Hybrid Intent security boundaries",()=>{
  it("rejeita caminho físico inventado pelo modelo que não aparece no pedido",()=>{
    const result=validateIntentSemantics(write("C:\\Windows\\System32\\drivers\\etc\\hosts"),"altere o arquivo hosts para abc");
    expect(result.valid).toBe(false);
    expect(result.ambiguities).toEqual(expect.arrayContaining([expect.objectContaining({code:"invented_physical_path",field:"path"})]));
  });
});
