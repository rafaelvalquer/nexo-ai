import { describe,expect,it } from "vitest";
import { validateIntentSemantics } from "../../../packages/core/src/intent/semantic-validator.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";

function intent(operation:string,entities:Record<string,string>):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent:operation==="create_folder"?"create":"update",operation,entities:Object.fromEntries(Object.entries(entities).map(([key,value])=>[key,{value,source:"user" as const,confidence:.99}])),referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
}

describe("semantic validator",()=>{
  it("não assume pasta quando o tipo do recurso é ambíguo",()=>{
    const result=validateIntentSemantics(intent("create_folder",{name:"teste",folder:"downloads"}),"crie teste em downloads");
    expect(result.valid).toBe(false);
    expect(result.ambiguities).toEqual(expect.arrayContaining([expect.objectContaining({code:"resource_type"})]));
    expect(result.question).toContain("pasta ou um arquivo");
  });

  it("bloqueia negação e pergunta informacional",()=>{
    expect(validateIntentSemantics(intent("create_folder",{name:"teste",folder:"downloads"}),"não crie uma pasta teste em downloads").reason).toBe("NEGATED_ACTION");
    expect(validateIntentSemantics(intent("create_folder",{name:"teste",folder:"downloads"}),"como criar uma pasta no Windows?").reason).toBe("INFORMATIONAL_REQUEST");
  });

  it("exige conteúdo para write_text_file",()=>{
    const result=validateIntentSemantics(intent("write_text_file",{file:"teste.txt"}),"altere teste.txt");
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("content");
  });
});
