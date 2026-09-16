import { describe,expect,it,vi } from "vitest";
import { Type } from "@browser_use/pi";
import type { AssistantMessage,Context,Model,ToolResultMessage } from "@earendil-works/pi-ai";
import { createOllamaNativeStreamFn } from "../../packages/browser-agent/src/ollama-native-transport";

const model:Model<"openai-completions">={id:"qwen3:4b",name:"qwen3:4b",api:"openai-completions",provider:"ollama",baseUrl:"http://127.0.0.1:11434/v1",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32_768,maxTokens:8_192};
const navigate={name:"browser_navigate",description:"Navigate",parameters:Type.Object({url:Type.String()})};
const doneTool={name:"browser_done",description:"Complete",parameters:Type.Object({summary:Type.String()})};
const baseContext=():Context=>({systemPrompt:"Use browser tools.",messages:[{role:"user",content:"Open example.com",timestamp:1}],tools:[navigate,doneTool]});
const call=(name="browser_navigate",args:Record<string,unknown>={url:"https://example.com"})=>({type:"function",function:{name,arguments:args}});
const ndjson=(chunks:unknown[])=>new Response(chunks.map(item=>JSON.stringify(item)).join("\n")+"\n",{status:200,headers:{"content-type":"application/x-ndjson"}});
async function consume(fetchMock:typeof fetch,context=baseContext(),factoryOptions:Parameters<typeof createOllamaNativeStreamFn>[2]={},options:Record<string,unknown>={}){const telemetry:unknown[]=[];const streamFn=createOllamaNativeStreamFn("http://127.0.0.1:11434","qwen3:4b",{...factoryOptions,onTelemetry:item=>telemetry.push(item)});const stream=await streamFn(model,context,{fetch:fetchMock,timeoutMs:5_000,...options});const events=[];for await(const event of stream)events.push(event);return{events,telemetry};}

describe("Browser Agent native Ollama streaming transport",()=>{
  it("parses streaming NDJSON, omits think and emits structured tool calls as Pi events",async()=>{
    const fetchMock=vi.fn(async()=>ndjson([{message:{role:"assistant",content:"Opening "}},{message:{role:"assistant",content:"now",tool_calls:[call()]},done:true,done_reason:"stop",prompt_eval_count:100,eval_count:12}]));
    const {events,telemetry}=await consume(fetchMock as typeof fetch);
    const request=JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request).toMatchObject({model:"qwen3:4b",stream:true});expect(Object.hasOwn(request,"think")).toBe(false);
    expect(events.some(event=>event.type==="text_delta"&&event.delta==="Opening ")).toBe(true);
    const done=events.find(event=>event.type==="done");expect(done).toMatchObject({reason:"toolUse",message:{usage:{input:100,output:12,totalTokens:112}}});
    expect(done&&done.type==="done"?done.message.content:[]).toEqual(expect.arrayContaining([expect.objectContaining({type:"toolCall",name:"browser_navigate"})]));
    expect(telemetry).toEqual([expect.objectContaining({structuredToolCallCount:1,firstChunkMs:expect.any(Number),recoveryAttempt:false})]);
  });

  it("counts thinking without exposing its contents in Pi events or telemetry",async()=>{
    const secret="PRIVATE-CHAIN-OF-THOUGHT";const fetchMock=vi.fn(async()=>ndjson([{message:{role:"assistant",thinking:secret}},{message:{role:"assistant",tool_calls:[call()]},done:true}]));
    const result=await consume(fetchMock as typeof fetch);expect(JSON.stringify(result)).not.toContain(secret);expect(result.telemetry).toEqual([expect.objectContaining({thinkingLength:secret.length})]);expect(result.events.some(event=>event.type.startsWith("thinking"))).toBe(false);
  });

  it("converts strict Qwen markup split across chunks and never emits markup or arguments as text",async()=>{
    const payload=JSON.stringify({name:"browser_navigate",arguments:{url:"https://example.com"}});const fetchMock=vi.fn(async()=>ndjson([{message:{content:"Ready <tool_"}},{message:{content:`call>${payload}</tool_call>`},done:true}]));
    const {events}=await consume(fetchMock as typeof fetch);const done=events.find(event=>event.type==="done");expect(done).toMatchObject({reason:"toolUse"});expect(JSON.stringify(events)).not.toContain("<tool_call>");expect(JSON.stringify(events)).not.toContain(payload);expect(done&&done.type==="done"?done.message.content:[]).toEqual(expect.arrayContaining([expect.objectContaining({type:"toolCall",name:"browser_navigate"})]));
  });

  it("rejects unknown tools, performs one recovery only and fails with a specific code",async()=>{
    const unknown=`<tool_call>${JSON.stringify({name:"dangerous_unknown_tool",arguments:{value:true}})}</tool_call>`;const fetchMock=vi.fn(async()=>ndjson([{message:{content:unknown},done:true}]));const {events}=await consume(fetchMock as typeof fetch);expect(fetchMock).toHaveBeenCalledTimes(2);expect(events.some(event=>event.type==="toolcall_end")).toBe(false);expect(events.at(-1)).toMatchObject({type:"error",error:{errorMessage:expect.stringContaining("BROWSER_MODEL_NO_TOOL_CALL")}});
  });

  it("recovers once from a text-only response and dynamically names the completion tool",async()=>{
    const fetchMock=vi.fn().mockImplementationOnce(async()=>ndjson([{message:{content:"I should navigate."},done:true}])).mockImplementationOnce(async()=>ndjson([{message:{tool_calls:[call("browser_done",{summary:"done"})]},done:true}]));const {events}=await consume(fetchMock as typeof fetch);expect(fetchMock).toHaveBeenCalledTimes(2);const retry=JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));expect(retry.messages.at(-1).content).toContain("browser_done");expect(events.at(-1)).toMatchObject({type:"done",reason:"toolUse"});
  });

  it("fails immediately after the single recovery when both turns are text-only",async()=>{const fetchMock=vi.fn(async()=>ndjson([{message:{content:"prose only"},done:true}]));const {events}=await consume(fetchMock as typeof fetch);expect(fetchMock).toHaveBeenCalledTimes(2);expect(events.at(-1)).toMatchObject({type:"error",error:{errorMessage:expect.stringContaining("BROWSER_MODEL_NO_TOOL_CALL")}});});

  it("separates first-chunk timeout, model-turn timeout and caller abort",async()=>{
    const stalled=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({cancel(){}}),{status:200}));const first=await consume(stalled as typeof fetch,baseContext(),{firstChunkTimeoutMs:5,modelTurnTimeoutMs:100});expect(first.events.at(-1)).toMatchObject({type:"error",error:{errorMessage:expect.stringContaining("BROWSER_PROVIDER_FIRST_CHUNK_TIMEOUT")}});
    const waiting=vi.fn(async(_url:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener("abort",()=>reject(init.signal?.reason),{once:true})));const turn=await consume(waiting as typeof fetch,baseContext(),{modelTurnTimeoutMs:5,firstChunkTimeoutMs:100});expect(turn.events.at(-1)).toMatchObject({type:"error",error:{errorMessage:expect.stringContaining("BROWSER_MODEL_TURN_TIMEOUT")}});
    const controller=new AbortController();const abortedPromise=consume(waiting as typeof fetch,baseContext(),{modelTurnTimeoutMs:100},{signal:controller.signal});controller.abort();const aborted=await abortedPromise;expect(aborted.events.at(-1)).toMatchObject({type:"error",reason:"aborted"});
  });

  it("replays assistant tool calls and tool results for a multi-turn request",async()=>{
    const assistant:AssistantMessage={role:"assistant",content:[{type:"toolCall",id:"call-1",name:"browser_navigate",arguments:{url:"https://example.com"}}],api:"openai-completions",provider:"ollama",model:"qwen3:4b",usage:{input:10,output:2,cacheRead:0,cacheWrite:0,totalTokens:12,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"toolUse",timestamp:2};const toolResult:ToolResultMessage={role:"toolResult",toolCallId:"call-1",toolName:"browser_navigate",content:[{type:"text",text:"Page opened"}],isError:false,timestamp:3};const context:Context={messages:[{role:"user",content:"Open example.com",timestamp:1},assistant,toolResult],tools:[navigate]};const fetchMock=vi.fn(async()=>ndjson([{message:{tool_calls:[call()]},done:true}]));await consume(fetchMock as typeof fetch,context);const request=JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));expect(request.messages[1].tool_calls[0].function).toEqual({name:"browser_navigate",arguments:{url:"https://example.com"}});expect(request.messages[2]).toMatchObject({role:"tool",tool_name:"browser_navigate",content:"Page opened"});
  });

  it("handles a representative first Browser Use turn rather than an artificial preflight tool",async()=>{const representative:Context={systemPrompt:"Browser agent with navigation and completion tools.",messages:[{role:"user",content:"Entre no site InfoMoney e resuma as principais notícias.",timestamp:1}],tools:[navigate,{name:"browser_extract",description:"Extract facts",parameters:Type.Object({query:Type.String()})},doneTool]};const fetchMock=vi.fn(async()=>ndjson([{message:{content:""}},{message:{tool_calls:[call("browser_navigate",{url:"https://www.infomoney.com.br"})]},done:true}]));const {events}=await consume(fetchMock as typeof fetch,representative);expect(events.at(-1)).toMatchObject({type:"done",reason:"toolUse"});expect(events.some(event=>event.type==="toolcall_end"&&event.toolCall.name==="browser_navigate")).toBe(true);});
});
