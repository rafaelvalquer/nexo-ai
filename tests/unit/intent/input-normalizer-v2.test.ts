import {describe,expect,it} from "vitest";
import {normalizeIntentInput} from "../../../packages/core/src/intent/input-normalizer.js";

describe("InputNormalizer V2",()=>{
  it("colapsa whitespace para routing sem alterar content literal",()=>{
    const input="edite   teste.txt\te coloque Cliente   XPTO\nAprovado";
    const result=normalizeIntentInput(input);
    expect(result.routingText).toBe("edite teste.txt e coloque Cliente XPTO Aprovado");
    expect(result.literalSegments.find(item=>item.type==="content")?.value).toBe("Cliente   XPTO\nAprovado");
  });
  it("preserva CRLF no conteúdo literal enquanto routingText normaliza linhas",()=>{
    const input="edite teste.txt e coloque Linha 1\r\nLinha   2";
    const result=normalizeIntentInput(input);
    expect(result.original).toBe(input);
    expect(result.routingText).toBe("edite teste.txt e coloque Linha 1 Linha 2");
    expect(result.literalSegments.find(item=>item.type==="content")?.value).toBe("Linha 1\r\nLinha   2");
  });
  it("mantém paths como segmentos literais",()=>{
    const result=normalizeIntentInput("leia C:\\Temp\\Meu Arquivo.txt");
    expect(result.explicitPaths[0]).toContain("C:\\Temp");
    expect(result.literalSegments.some(item=>item.type==="path")).toBe(true);
  });
});
