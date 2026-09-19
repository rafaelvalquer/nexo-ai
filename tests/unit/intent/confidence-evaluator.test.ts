import {describe,expect,it} from "vitest";
import {evaluateIntentConfidence} from "../../../packages/core/src/intent/confidence-evaluator.js";
import type {CanonicalIntent} from "../../../packages/core/src/intent/types.js";

const intent:CanonicalIntent={schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:{value:"teste",source:"user"},folder:{value:"downloads",source:"user"}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};

describe("evaluateIntentConfidence",()=>{
  it("não depende apenas da confiança declarada pelo modelo",()=>{
    const good=evaluateIntentConfidence(intent,{valid:true,intent,missing:[],ambiguities:[]});
    const bad=evaluateIntentConfidence(intent,{valid:false,intent,missing:["folder"],ambiguities:[{code:"resource_type",message:"ambíguo",critical:true}]});
    expect(good.overall).toBeGreaterThanOrEqual(.9);
    expect(bad.overall).toBeLessThan(.9);
    expect(bad.ambiguity).toBe(0);
  });
});
