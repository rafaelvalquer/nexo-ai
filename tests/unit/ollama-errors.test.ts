import { describe, it, expect, vi } from "vitest";
import { OllamaTimeoutError, OllamaConnectionError } from "../../packages/core/src/llm/errors.js";
import { DEFAULT_TIMEOUTS } from "../../packages/core/src/config/defaults.js";

describe("Ollama Errors", () => {
  it("OllamaTimeoutError tem mensagem amigável", () => {
    const err = new OllamaTimeoutError("planejamento", "qwen3:4b", 45);
    expect(err.message).toContain("planejamento");
    expect(err.message).toContain("45");
    expect(err.name).toBe("OllamaTimeoutError");
  });

  it("OllamaConnectionError tem mensagem amigável", () => {
    const err = new OllamaConnectionError();
    expect(err.message).toContain("Ollama");
    expect(err.name).toBe("OllamaConnectionError");
  });

  it("DEFAULT_TIMEOUTS estão corretos", () => {
    expect(DEFAULT_TIMEOUTS.planner).toBe(45_000);
    expect(DEFAULT_TIMEOUTS.chat).toBe(300_000);
    expect(DEFAULT_TIMEOUTS.health).toBe(5_000);
  });
});
