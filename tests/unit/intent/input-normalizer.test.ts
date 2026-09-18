import { describe,expect,it } from "vitest";
import { normalizeIntentInput } from "../../../packages/core/src/intent/input-normalizer.js";

describe("normalizeIntentInput",()=>{
  it("preserva conteúdo, nomes e caminhos enquanto normaliza Unicode",()=>{
    const input='  altere "teste123.txt" em C:\\Users\\Rafael\\Downloads para  texto   com  espaços  ';
    const result=normalizeIntentInput(input);
    expect(result.normalized).toContain("texto   com  espaços");
    expect(result.quoted).toEqual(["teste123.txt"]);
    expect(result.explicitPaths[0]).toContain("C:\\Users\\Rafael\\Downloads");
    expect(result.extensions).toContain("txt");
  });
});
