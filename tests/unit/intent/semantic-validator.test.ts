import { describe, expect, it } from "vitest";
import { validateIntentSemantics } from "../../../packages/core/src/intent/semantic-validator.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";

function intent(operation: string, entities: Record<string, string>, missing: string[] = []): CanonicalIntent {
  return {
    schemaVersion: 1,
    domain: "filesystem",
    intent: operation === "create_folder" ? "create" : "update",
    operation,
    entities: Object.fromEntries(
      Object.entries(entities).map(([key, value]) => [
        key,
        { value, source: "user" as const, confidence: 0.99 }
      ])
    ),
    referencesPreviousResult: false,
    ambiguities: [],
    missing,
    source: "llm",
    diagnostics: { rawModelConfidence: 0.99, resolverVersion: "test" }
  };
}

describe("semantic validator", () => {
  it("não assume pasta quando o tipo do recurso é ambíguo", () => {
    const result = validateIntentSemantics(intent("create_folder", { name: "teste", folder: "downloads" }), "crie teste em downloads");
    expect(result.valid).toBe(false);
    expect(result.ambiguities).toEqual(expect.arrayContaining([expect.objectContaining({ code: "resource_type" })]));
    expect(result.question).toContain("pasta ou um arquivo");
  });

  it("bloqueia negação e pergunta informacional", () => {
    expect(validateIntentSemantics(intent("create_folder", { name: "teste", folder: "downloads" }), "não crie uma pasta teste em downloads").reason).toBe("NEGATED_ACTION");
    expect(validateIntentSemantics(intent("create_folder", { name: "teste", folder: "downloads" }), "como criar uma pasta no Windows?").reason).toBe("INFORMATIONAL_REQUEST");
  });

  it("rejeita name/newName que carregam caminho embutido", () => {
    const create = validateIntentSemantics(intent("create_folder", { name: "sub\\teste", folder: "downloads" }), "crie uma pasta sub\\teste em downloads");
    expect(create.ambiguities).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsafe_name", field: "name" })]));
    const rename = validateIntentSemantics(intent("rename_file", { path: "C:\\Temp\\a.txt", newName: "outra\\b.txt" }), "renomeie C:\\Temp\\a.txt para outra\\b.txt");
    expect(rename.ambiguities).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsafe_name", field: "newName" })]));
  });

  it("exige conteúdo para write_text_file", () => {
    const result = validateIntentSemantics(intent("write_text_file", { file: "teste.txt" }), "altere teste.txt");
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("content");
  });

  it("ignora missing incorreto declarado pela LLM quando a entity existe", async () => {
    const testIntent: CanonicalIntent = {
      schemaVersion: 1,
      domain: "filesystem",
      intent: "create",
      operation: "create_folder",
      entities: {
        name: { value: "teste", source: "user" },
        folder: { value: "downloads", source: "semantic_alias" }
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: ["name", "folder"],
      source: "llm"
    };

    const result = validateIntentSemantics(testIntent, "crie uma pasta teste em downloads");

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.intent.missing).toEqual([]);
    expect(result.intent.diagnostics?.modelDeclaredMissing).toEqual(["name", "folder"]);
    expect(result.intent.diagnostics?.coreDerivedMissing).toEqual([]);
  });

  it("deriva missing pelo Core quando a LLM diz missing=[] mas a entity obrigatória não existe", () => {
    const testIntent: CanonicalIntent = {
      schemaVersion: 1,
      domain: "filesystem",
      intent: "create",
      operation: "create_folder",
      entities: {
        name: { value: "teste", source: "user" }
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      source: "llm"
    };

    const result = validateIntentSemantics(testIntent, "crie uma pasta chamada teste");

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["folder"]);
    expect(result.intent.missing).toEqual(["folder"]);
    expect(result.reason).toBe("MISSING_REQUIRED_ENTITY");
    expect(result.question).toBe("Em qual pasta devo executar essa ação?");
  });
});
