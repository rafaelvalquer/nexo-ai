import { describe, expect, it } from "vitest";
import { OllamaProvider } from "../../packages/core/src/llm/ollama.js";

describe("OllamaProvider timeout signal", () => {
  it("keeps the internal timeout when an external abort signal is provided", async () => {
    const provider = new OllamaProvider("http://127.0.0.1:11434", "test-model");
    const external = new AbortController();
    const combined = (provider as any).signal(external.signal, 10) as AbortSignal;

    expect(combined).not.toBe(external.signal);
    expect(combined.aborted).toBe(false);

    await new Promise<void>(resolve => combined.addEventListener("abort", () => resolve(), { once: true }));

    expect(combined.aborted).toBe(true);
    expect(external.signal.aborted).toBe(false);
  });

  it("still propagates manual cancellation immediately", () => {
    const provider = new OllamaProvider("http://127.0.0.1:11434", "test-model");
    const external = new AbortController();
    const combined = (provider as any).signal(external.signal, 60_000) as AbortSignal;

    external.abort(new DOMException("Cancelado", "AbortError"));

    expect(combined.aborted).toBe(true);
  });
});
