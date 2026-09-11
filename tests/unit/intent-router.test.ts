import { describe, it, expect } from "vitest";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router.js";

const router = new FastIntentRouter();

describe("FastIntentRouter", () => {
  it("detecta salvar nome", () => {
    const result = router.route("Meu nome é Rafael, pode salvar isso?");
    expect(result).not.toBeNull();
    expect(result?.tool).toBe("memory_save");
    expect((result?.input as any)?.key).toBe("user.name");
    expect((result?.input as any)?.value).toBe("Rafael");
  });

  it("detecta busca por nome", () => {
    const result = router.route("Qual é meu nome?");
    expect(result).not.toBeNull();
    expect(result?.tool).toBe("memory_search");
  });

  it("detecta esquecimento de nome", () => {
    const result = router.route("Esqueça meu nome.");
    expect(result).not.toBeNull();
    expect(result?.tool).toBe("memory_delete");
  });

  it("detecta salvar projeto", () => {
    const result = router.route("Meu projeto TavernQuest fica em C:\\Projetos\\TavernQuest");
    expect(result).not.toBeNull();
    expect(result?.tool).toBe("memory_save");
    expect((result?.input as any)?.key).toContain("tavernquest");
  });

  it("detecta PC lento", () => {
    const result = router.route("Meu computador está lento");
    expect(result).not.toBeNull();
    expect(result?.steps).toBeDefined();
  });

  it("retorna null para texto ambíguo", () => {
    const result = router.route("Como você está?");
    expect(result).toBeNull();
  });
});
