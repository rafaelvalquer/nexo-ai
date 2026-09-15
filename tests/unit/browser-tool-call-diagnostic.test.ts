import { describe, expect, it, vi } from "vitest";
import { runBrowserToolCallingDiagnostic } from "../../scripts/lib/browser-tool-call-diagnostic.mjs";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json" }
  });
}

describe("Browser Agent Ollama tool-calling diagnostic", () => {
  it("classifies native API support when OpenAI-compatible endpoint does not emit a tool call", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ capabilities:["tools"] }))
      .mockResolvedValueOnce(response({
        choices:[{ message:{ role:"assistant", content:"Vou abrir a página." } }]
      }))
      .mockResolvedValueOnce(response({
        message:{
          role:"assistant",
          content:"",
          tool_calls:[{
            function:{
              name:"nexo_browser_preflight",
              arguments:{ url:"https://example.com" }
            }
          }]
        }
      }));

    const result = await runBrowserToolCallingDiagnostic({
      fetchImpl:fetchMock,
      ollamaUrl:"http://127.0.0.1:11434",
      model:"qwen3:4b",
      now:() => 1000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("diagnostic unexpectedly failed");
    expect(result.openaiCompatible.toolCallDetected).toBe(false);
    expect(result.nativeApi.toolCallDetected).toBe(true);
    expect(result.comparison).toBe("native_api_only");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const nativeRequest = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)) as {
      model:string;
      think:boolean;
      tools:Array<{function:{name:string}}>;
    };
    expect(nativeRequest.model).toBe("qwen3:4b");
    expect(nativeRequest.think).toBe(false);
    expect(nativeRequest.tools[0]?.function.name).toBe("nexo_browser_preflight");
  });

  it("classifies neither endpoint when both return text without tool calls", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ capabilities:["tools"] }))
      .mockResolvedValueOnce(response({ choices:[{message:{role:"assistant",content:"texto"}}] }))
      .mockResolvedValueOnce(response({ message:{role:"assistant",content:"texto"} }));

    const result = await runBrowserToolCallingDiagnostic({
      fetchImpl:fetchMock,
      model:"qwen3:4b",
      now:() => 1000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("diagnostic unexpectedly failed");
    expect(result.openaiCompatible.toolCallDetected).toBe(false);
    expect(result.nativeApi.toolCallDetected).toBe(false);
    expect(result.comparison).toBe("neither_endpoint_supports_tool_calling");
  });

  it("classifies both endpoints when both emit the expected tool call", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ capabilities:["tools"] }))
      .mockResolvedValueOnce(response({
        choices:[{message:{
          role:"assistant",
          content:"",
          tool_calls:[{function:{name:"nexo_browser_preflight",arguments:JSON.stringify({url:"https://example.com"})}}]
        }}]
      }))
      .mockResolvedValueOnce(response({
        message:{
          role:"assistant",
          content:"",
          tool_calls:[{function:{name:"nexo_browser_preflight",arguments:{url:"https://example.com"}}}]
        }
      }));

    const result = await runBrowserToolCallingDiagnostic({
      fetchImpl:fetchMock,
      model:"qwen3:4b",
      now:() => 1000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("diagnostic unexpectedly failed");
    expect(result.comparison).toBe("both_support_tool_calling");
  });

  it("returns a structured failure when Ollama model metadata cannot be read", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error:"model not found" }, 404));

    const result = await runBrowserToolCallingDiagnostic({
      fetchImpl:fetchMock,
      model:"missing:latest",
      now:() => 1000
    });

    expect(result).toMatchObject({
      ok:false,
      model:"missing:latest",
      stage:"model_info",
      httpStatus:404
    });
  });
});
