import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAgentPreflightError,
  buildBrowserToolCallingProbeRequest,
  NEXO_OLLAMA_COMPAT_API_KEY,
  NexoBrowserModelAdapter
} from "../../packages/browser-agent/src/model-adapter";

const toolCallResponse = () => ({
  message:{
    role:"assistant",
    content:"",
    tool_calls:[{
      type:"function",
      function:{
        name:"nexo_browser_preflight",
        arguments:{url:"https://example.com"}
      }
    }]
  }
});
const tagsResponse = (model="qwen3:4b") => new Response(JSON.stringify({models:[{name:model,model}]}),{status:200,headers:{"content-type":"application/json"}});

describe("Browser Agent Ollama model adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a non-empty local compatibility API key for pi-ai model catalog", async () => {
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

  it("validates tool calling through native /api/chat using the Browser Agent runtime think mode", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools","vision"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response(JSON.stringify(toolCallResponse()), { status:200, headers:{"content-type":"application/json"} }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:4b");
    const result = await adapter.preflight();

    expect(result.available).toBe(true);
    expect(result.modelExists).toBe(true);
    expect(result.toolCallingValidated).toBe(true);
    expect(result.toolCallSource).toBe("structured");
    expect(result.capabilities).toContain("vision");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/api/chat");

    const request = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body)) as {
      think?:boolean;
      stream?:boolean;
      tools?: Array<{function?:{name?:string}}>;
      messages?: Array<{content?:string}>;
    };
    expect(request.think).toBe(false);
    expect(request.stream).toBe(false);
    expect(request.tools?.[0]?.function?.name).toBe("nexo_browser_preflight");
    expect(request.messages?.at(-1)?.content).toContain("https://example.com");
  });

  it("accepts Qwen <tool_call> markup when Ollama does not populate message.tool_calls", async () => {
    const markup = `<tool_call>${JSON.stringify({
      name:"nexo_browser_preflight",
      arguments:{url:"https://example.com"}
    })}</tool_call>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools","thinking"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message:{role:"assistant",content:markup} }), { status:200, headers:{"content-type":"application/json"} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:4b").preflight();

    expect(result.toolCallSource).toBe("qwen_markup");
    expect(result.diagnostic).toMatchObject({
      structuredToolCallCount:0,
      fallbackToolCallCount:1,
      containsToolCallMarkup:true,
      invalidToolCallMarkupCount:0
    });
  });

  it("rejects a native response without a valid tool call and exposes only sanitized diagnostics", async () => {
    const rawContent = "Vou abrir a página com um segredo local.";
    const rawThinking = "RACIOCINIO-PRIVADO-NAO-LOGAR";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools","thinking"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message:{role:"assistant",content:rawContent,thinking:rawThinking} }), { status:200, headers:{"content-type":"application/json"} }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:4b");
    let captured:unknown;
    try {
      await adapter.preflight();
    } catch (error) {
      captured = error;
    }

    expect(captured).toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_MODEL_TOOL_CALL_UNSUPPORTED" });
    const message = captured instanceof Error ? captured.message : String(captured);
    expect(message).toContain(`contentLength=${rawContent.length}`);
    expect(message).toContain(`thinkingLength=${rawThinking.length}`);
    expect(message).not.toContain(rawContent);
    expect(message).not.toContain(rawThinking);
  });

  it("rejects a native tool call with unexpected arguments", async () => {
    const response = toolCallResponse();
    response.message.tool_calls[0].function.arguments = {url:"https://wrong.example"};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities:["tools"] }), { status:200, headers:{"content-type":"application/json"} }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status:200, headers:{"content-type":"application/json"} }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:4b");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({
      code:"BROWSER_MODEL_TOOL_CALL_UNSUPPORTED"
    });
  });

  it("reports a missing Ollama model explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => tagsResponse("another:latest")));
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "missing:latest");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_MODEL_NOT_FOUND" });
  });

  it("reports an unavailable Ollama endpoint explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ECONNREFUSED"); }));
    const adapter = new NexoBrowserModelAdapter("http://127.0.0.1:11434", "qwen3:8b");
    await expect(adapter.preflight()).rejects.toMatchObject<Partial<BrowserAgentPreflightError>>({ code:"BROWSER_OLLAMA_UNAVAILABLE" });
  });

  it("reports an incompatible native endpoint explicitly", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tagsResponse("qwen3:8b"))
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

  it("builds probes with think omitted, false and true without conflating the modes",()=>{
    const omitted=buildBrowserToolCallingProbeRequest("qwen3:4b");
    expect(Object.hasOwn(omitted,"think")).toBe(false);
    expect(buildBrowserToolCallingProbeRequest("qwen3:4b",false)).toMatchObject({think:false});
    expect(buildBrowserToolCallingProbeRequest("qwen3:4b",true)).toMatchObject({think:true});
  });

  it("classifies /api/show HTTP 400 with sanitized Ollama detail and model source",async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(tagsResponse("bad:tag")).mockResolvedValueOnce(new Response(JSON.stringify({error:"invalid model configuration\nsecret-free"}),{status:400,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    const adapter=new NexoBrowserModelAdapter("http://127.0.0.1:11434","bad:tag","environment:NEXO_BROWSER_AGENT_MODEL");
    const error=await adapter.preflight().catch(value=>value as BrowserAgentPreflightError);
    expect(error).toMatchObject<Partial<BrowserAgentPreflightError>>({code:"BROWSER_MODEL_CONFIG_INVALID",metadata:{model:"bad:tag",source:"environment:NEXO_BROWSER_AGENT_MODEL",httpStatus:400}});
    expect(error.message).toContain("invalid model configuration secret-free");
  });
});
