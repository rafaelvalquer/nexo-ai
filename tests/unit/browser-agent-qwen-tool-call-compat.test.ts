import { describe, expect, it } from "vitest";
import {
  formatSanitizedToolCallDiagnostic,
  inspectOllamaToolCalls
} from "../../packages/browser-agent/src/tool-call-compat";

describe("Browser Agent Qwen tool-call compatibility", () => {
  it("accepts structured Ollama tool calls", () => {
    const result = inspectOllamaToolCalls({
      content:"",
      tool_calls:[{
        type:"function",
        function:{ name:"browser_navigate", arguments:{url:"https://example.com"} }
      }]
    }, new Set(["browser_navigate"]));

    expect(result.calls).toEqual([{
      name:"browser_navigate",
      arguments:{url:"https://example.com"},
      source:"structured"
    }]);
    expect(result.diagnostic).toMatchObject({
      structuredToolCallCount:1,
      fallbackToolCallCount:0,
      containsToolCallMarkup:false
    });
  });

  it("converts explicit Qwen <tool_call> markup and strips it from assistant text", () => {
    const result = inspectOllamaToolCalls({
      content:[
        "Vou abrir a página.",
        "<tool_call>",
        JSON.stringify({ name:"browser_navigate", arguments:{url:"https://example.com"} }),
        "</tool_call>"
      ].join("\n")
    }, new Set(["browser_navigate"]));

    expect(result.calls).toEqual([{
      name:"browser_navigate",
      arguments:{url:"https://example.com"},
      source:"qwen_markup"
    }]);
    expect(result.sanitizedContent).toBe("Vou abrir a página.");
    expect(result.diagnostic.fallbackToolCallCount).toBe(1);
    expect(result.diagnostic.containsToolCallMarkup).toBe(true);
  });

  it("does not execute arbitrary JSON or unknown tools", () => {
    const result = inspectOllamaToolCalls({
      content:[
        JSON.stringify({ name:"browser_navigate", arguments:{url:"https://example.com"} }),
        "<tool_call>",
        JSON.stringify({ name:"delete_everything", arguments:{confirm:true} }),
        "</tool_call>"
      ].join("\n")
    }, new Set(["browser_navigate"]));

    expect(result.calls).toEqual([]);
    expect(result.diagnostic.invalidToolCallMarkupCount).toBe(1);
    expect(result.sanitizedContent).toContain("browser_navigate");
    expect(result.sanitizedContent).not.toContain("delete_everything");
  });

  it("reports only sanitized metadata and never raw reasoning or arguments", () => {
    const secret = "SUPER-SECRET-REASONING";
    const result = inspectOllamaToolCalls({
      content:"Resposta sem ferramenta",
      thinking:secret,
      tool_calls:[]
    }, new Set(["browser_navigate"]));
    const diagnostic = formatSanitizedToolCallDiagnostic(result.diagnostic);

    expect(diagnostic).toContain(`thinkingLength=${secret.length}`);
    expect(diagnostic).toContain("contentLength=23");
    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).not.toContain("Resposta sem ferramenta");
  });
});
