import {describe,expect,it} from "vitest";
import {PreRoutingSafetyGuard} from "../../../packages/core/src/application/pre-routing-safety-guard.js";
import {normalizeIntentInput} from "../../../packages/core/src/intent/input-normalizer.js";

describe("PreRoutingSafetyGuard",()=>{
  const guard=new PreRoutingSafetyGuard();
  it.each([
    "não crie uma pasta chamada teste nos downloads",
    "não altere o arquivo teste123.txt",
    "não apague esse arquivo"
  ])("termina mutação negada antes de qualquer router: %s",input=>{
    expect(guard.evaluate(normalizeIntentInput(input))).toMatchObject({terminal:true,status:"negated",reason:"NEGATED_ACTION"});
  });

  it.each([
    "como criar uma pasta no Windows?",
    "como faço para editar um arquivo?",
    "pode me explicar como mover um arquivo?"
  ])("mantém pedido informacional fora das Tools: %s",input=>{
    expect(guard.evaluate(normalizeIntentInput(input))).toMatchObject({terminal:true,status:"informational"});
  });

  it.each([
    "crie uma pasta ../teste em downloads",
    "crie ../../abc em documentos",
    "crie pasta . em downloads"
  ])("bloqueia traversal de forma terminal: %s",input=>{
    expect(guard.evaluate(normalizeIntentInput(input))).toMatchObject({terminal:true,status:"traversal",reason:"UNSAFE_RESOURCE_NAME"});
  });
});
