import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../../apps/desktop/renderer/utils/fuzzy-score";

describe("command fuzzy scoring", () => {
  it("matches Portuguese text without requiring diacritics", () => {
    expect(fuzzyScore("Abrir Escritório", "escritorio")).toBeGreaterThan(0);
  });

  it("matches ordered character subsequences for small typos", () => {
    expect(fuzzyScore("Abrir Configurações", "cfgs")).toBeGreaterThan(0);
    expect(fuzzyScore("Abrir Configurações", "xyz")).toBe(-1);
  });

  it("ranks word-boundary and direct matches above scattered matches", () => {
    expect(fuzzyScore("Abrir relatório semanal", "relatorio"))
      .toBeGreaterThan(fuzzyScore("Executar macro para revisar relatório semanal", "relatorio"));
  });

  it("returns a stable score for an empty query", () => {
    expect(fuzzyScore("Abrir Assistente", "   ")).toBe(1);
  });
});
