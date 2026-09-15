import { describe, expect, it, vi } from "vitest";
import { Type } from "@browser_use/pi";
import type { AssistantMessage, Context, Model, ToolResultMessage } from "@earendil-works/pi-ai";
import { createOllamaNativeStreamFn } from "../../packages/browser-agent/src/ollama-native-transport";

const model:Model<"openai-completions"> = {
  id:"qwen3:4b",
  name:"qwen3:4b",
  api:"openai-completions",
  provider:"ollama",
  baseUrl:"http://127.0.0.1:11434/v1",
  reasoning:false,
  input:["text"],
  cost:{ input:0, output:0, cacheRead:0, cacheWrite:0 },
  contextWindow:32_768,
  maxTokens:8_192
};

function browserTool() {
  return {
    name:"browser_navigate",
    description:"Navigate to a URL",
    parameters:Type.Object({ url:Type.String() })
  };
}

function context():Context {
  return {
    systemPrompt:"Use browser tools.",
    messages:[{ role:"user", content:"Open example.com", timestamp:1 }],
    tools:[browserTool()]
  };
}

describe("Browser Agent native Ollama transport", () => {
  it("sends Pi tools to /api/chat without forcing think and emits a Pi tool call", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message:{
        role:"assistant",
        content:"",
        tool_calls:[{
          type:"function",
          function:{ name:"browser_navigate", arguments:{url:"https://example.com"} }
        }]
      },
      done:true,
      done_reason:"stop",
      prompt_eval_count:100,
      eval_count:12
    }), { status:200, headers:{"content-type":"application/json"} }));

    const streamFn = createOllamaNativeStreamFn("http://127.0.0.1:11434/", "qwen3:4b");
    const stream = await streamFn(model, context(), { fetch:fetchMock as typeof fetch, timeoutMs:5_000 });
    const events = [];
    for await (const event of stream) events.push(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/api/chat");
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      model:string;
      stream:boolean;
      think?:boolean;
      messages:Array<{role:string;content?:string}>;
      tools:Array<{function:{name:string}}>;
    };
    expect(request.model).toBe("qwen3:4b");
    expect(request.stream).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(request, "think")).toBe(false);
    expect(request.messages[0]).toMatchObject({ role:"system", content:"Use browser tools." });
    expect(request.tools[0]?.function.name).toBe("browser_navigate");

    const done = events.find(event => event.type === "done");
    expect(done).toBeDefined();
    if (!done || done.type !== "done") throw new Error("done event missing");
    expect(done.reason).toBe("toolUse");
    expect(done.message.usage).toMatchObject({ input:100, output:12, totalTokens:112 });
    expect(done.message.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type:"toolCall", name:"browser_navigate", arguments:{url:"https://example.com"} })
    ]));
  });

  it("converts Qwen <tool_call> markup into a Pi tool call", async () => {
    const markup = [
      "Vou navegar agora.",
      "<tool_call>",
      JSON.stringify({ name:"browser_navigate", arguments:{url:"https://example.com"} }),
      "</tool_call>"
    ].join("\n");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message:{ role:"assistant", content:markup },
      done:true,
      done_reason:"stop"
    }), { status:200, headers:{"content-type":"application/json"} }));

    const streamFn = createOllamaNativeStreamFn("http://127.0.0.1:11434", "qwen3:4b");
    const stream = await streamFn(model, context(), { fetch:fetchMock as typeof fetch, timeoutMs:5_000 });
    const events = [];
    for await (const event of stream) events.push(event);

    const done = events.find(event => event.type === "done");
    if (!done || done.type !== "done") throw new Error("done event missing");
    expect(done.reason).toBe("toolUse");
    expect(done.message.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type:"text", text:"Vou navegar agora." }),
      expect.objectContaining({ type:"toolCall", name:"browser_navigate", arguments:{url:"https://example.com"} })
    ]));
    expect(JSON.stringify(done.message.content)).not.toContain("<tool_call>");
  });

  it("does not promote an unknown Qwen markup tool into the Pi execution loop", async () => {
    const markup = `<tool_call>${JSON.stringify({ name:"dangerous_unknown_tool", arguments:{value:true} })}</tool_call>`;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message:{ role:"assistant", content:markup },
      done:true,
      done_reason:"stop"
    }), { status:200, headers:{"content-type":"application/json"} }));

    const streamFn = createOllamaNativeStreamFn("http://127.0.0.1:11434", "qwen3:4b");
    const stream = await streamFn(model, context(), { fetch:fetchMock as typeof fetch, timeoutMs:5_000 });
    const events = [];
    for await (const event of stream) events.push(event);

    const done = events.find(event => event.type === "done");
    if (!done || done.type !== "done") throw new Error("done event missing");
    expect(done.reason).toBe("stop");
    expect(done.message.content.some(block => block.type === "toolCall")).toBe(false);
  });

  it("replays assistant tool calls and tool results in Ollama native format", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message:{ role:"assistant", content:"Concluído." },
      done:true,
      done_reason:"stop",
      prompt_eval_count:120,
      eval_count:5
    }), { status:200, headers:{"content-type":"application/json"} }));

    const assistant:AssistantMessage = {
      role:"assistant",
      content:[{
        type:"toolCall",
        id:"call-1",
        name:"browser_navigate",
        arguments:{url:"https://example.com"}
      }],
      api:"openai-completions",
      provider:"ollama",
      model:"qwen3:4b",
      usage:{
        input:10,
        output:2,
        cacheRead:0,
        cacheWrite:0,
        totalTokens:12,
        cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}
      },
      stopReason:"toolUse",
      timestamp:2
    };
    const toolResult:ToolResultMessage = {
      role:"toolResult",
      toolCallId:"call-1",
      toolName:"browser_navigate",
      content:[{type:"text",text:"Page opened"}],
      isError:false,
      timestamp:3
    };
    const multiTurnContext:Context = {
      messages:[
        { role:"user", content:"Open example.com", timestamp:1 },
        assistant,
        toolResult
      ],
      tools:[browserTool()]
    };

    const streamFn = createOllamaNativeStreamFn("http://127.0.0.1:11434", "qwen3:4b");
    const stream = await streamFn(model, multiTurnContext, { fetch:fetchMock as typeof fetch, timeoutMs:5_000 });
    for await (const _event of stream) { /* consume */ }

    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      messages:Array<{
        role:string;
        content:string;
        tool_name?:string;
        tool_calls?:Array<{function:{name:string;arguments:Record<string,unknown>}}>;
      }>;
    };
    expect(request.messages[1]?.tool_calls?.[0]?.function).toEqual({
      name:"browser_navigate",
      arguments:{url:"https://example.com"}
    });
    expect(request.messages[2]).toMatchObject({
      role:"tool",
      tool_name:"browser_navigate",
      content:"Page opened"
    });
  });
});
