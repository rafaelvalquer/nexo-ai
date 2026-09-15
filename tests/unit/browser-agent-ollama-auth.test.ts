import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAgentPreflightError,
  NEXO_OLLAMA_COMPAT_API_KEY,
  NexoBrowserModelAdapter
} from "../../packages/browser-agent/src/model-adapter";

describe("Browser Agent Ollama model adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a non-empty local compatibility API key for pi-ai", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ capabilities: ["tools"] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )));

    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434/", "qwen3:1.7b");
    const { models, model } = await adapter.createModels();
    const resolved = models.getModel("ollama", "qwen3:1.7b");
    const auth = await models.getAuth("ollama");

    expect(model).toBe("ollama/qwen3:1.7b");
    expect(resolved?.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(auth?.auth.apiKey).toBe(NEXO_OLLAMA_COMPAT_API_KEY);
    expect(auth?.auth.apiKey).toBeTruthy();
    expect(auth?.source).toMatch(/Nexo local Ollama/i);
  });

  it("keeps the compatibility token local and independent from environment credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ capabilities: [] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )));

    const previous = process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_API_KEY;
    try {
      const { models } = await new NexoBrowserModelAdapter("http://localhost:11434", "qwen3:4b").createModels();
      const auth = await models.getAuth("ollama");
      expect(auth?.auth.apiKey).toBe(NEXO_OLLAMA_COMPAT_API_KEY);
    } finally {
      if (previous === undefined) delete process.env.OLLAMA_API_KEY;
      else process.env.OLLAMA_API_KEY = previous;
    }
  });

  it("validates Ollama and the OpenAI-compatible endpoint before browser startup", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools","vision"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices:[{message:{role:"assistant",content:"OK"}}] }), { status:200, headers:{"content-type":"application/json"} }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:8b");
    const result = await adapter.preflight();

    expect(result.available).toBe(true);
    expect(result.modelExists).toBe(true);
    expect(result.capabilities).toContain("vision");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/v1/chat/completions");
  });

  it("reports a missing Ollama model explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status:404 })));
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "missing:latest");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_MODEL_NOT_FOUND" });
  });

  it("reports an unavailable Ollama endpoint explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ECONNREFUSED"); }));
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:8b");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_OLLAMA_UNAVAILABLE" });
  });

  it("reports an incompatible OpenAI endpoint explicitly", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response("bad gateway", { status:502 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:8b");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_MODEL_INCOMPATIBLE" });
  });

  it("maps preflight timeouts to a dedicated error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Timed out", "TimeoutError"); }));
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:8b");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_OLLAMA_TIMEOUT" });
  });
});
