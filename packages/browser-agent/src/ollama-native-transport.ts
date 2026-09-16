import { randomUUID } from "node:crypto";
import type { BrowserAgentErrorCode, BrowserModelTurnTelemetry } from "@nexo/shared/browser-agent";
import type { StreamFn } from "@browser_use/pi";
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model, type SimpleStreamOptions, type ToolCall } from "@earendil-works/pi-ai";
import { inspectOllamaToolCalls } from "./tool-call-compat.js";

const DEFAULT_MODEL_TURN_TIMEOUT_MS = 300_000;
const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 60_000;
const RECOVERY_INSTRUCTION = "Your previous response did not call a tool. Call exactly one available tool now. Do not answer with prose.";

type OllamaMessage = {role:"system"|"user"|"assistant"|"tool";content:string;images?:string[];tool_name?:string;tool_calls?:OllamaToolCall[]};
type OllamaToolCall = {type:"function";function:{name:string;arguments:Record<string,unknown>}};
type OllamaChatChunk = {message?:{role?:unknown;content?:unknown;thinking?:unknown;tool_calls?:unknown};done?:unknown;done_reason?:unknown;prompt_eval_count?:unknown;eval_count?:unknown};
type TransportOptions={firstChunkTimeoutMs?:number;modelTurnTimeoutMs?:number;onTelemetry?:(telemetry:BrowserModelTurnTelemetry)=>void};
type TurnResult={validToolCalls:number;diagnostic:ReturnType<typeof inspectOllamaToolCalls>["diagnostic"];doneReason:string;firstChunkMs:number|null;durationMs:number;promptTokens:number;completionTokens:number};

export class BrowserModelTransportError extends Error {
  constructor(public readonly code:BrowserAgentErrorCode,message:string){super(message);this.name="BrowserModelTransportError";}
}

/** Browser-Agent-only streaming transport for Ollama's NDJSON /api/chat API. */
export function createOllamaNativeStreamFn(ollamaUrl:string,configuredModelId:string,transport:TransportOptions={}):StreamFn {
  const base=ollamaUrl.replace(/\/$/,"");
  return (model,context,options)=>{
    const stream=createAssistantMessageEventStream(),output=createOutput(model);
    void (async()=>{
      stream.push({type:"start",partial:output});
      const textEmitter=new TextEmitter(stream,output);
      try{
        const allowed=new Set((context.tools??[]).map(tool=>tool.name));
        const maxAttempts=allowed.size>0?2:1;
        let finalReason="stop";
        for(let attempt=0;attempt<maxAttempts;attempt++){
          const result=await runTurn({base,modelId:configuredModelId||model.id,model,context,options,transport,stream,output,textEmitter,allowed,recoveryAttempt:attempt===1});
          applyUsage(output,result.promptTokens,result.completionTokens);
          transport.onTelemetry?.({model:configuredModelId||model.id,durationMs:result.durationMs,firstChunkMs:result.firstChunkMs,contentLength:result.diagnostic.assistantContentLength,thinkingLength:result.diagnostic.thinkingLength,structuredToolCallCount:result.diagnostic.structuredToolCallCount,qwenMarkupToolCallCount:result.diagnostic.fallbackToolCallCount,invalidMarkupCount:result.diagnostic.invalidToolCallMarkupCount,toolNames:result.diagnostic.toolNames,doneReason:result.doneReason,promptTokens:result.promptTokens,completionTokens:result.completionTokens,totalTokens:result.promptTokens+result.completionTokens,recoveryAttempt:attempt===1});
          finalReason=result.doneReason;
          if(result.validToolCalls>0){textEmitter.end();output.stopReason="toolUse";stream.push({type:"done",reason:"toolUse",message:output});stream.end();return;}
          if(allowed.size===0)break;
          if(attempt===0)continue;
          throw new BrowserModelTransportError("BROWSER_MODEL_NO_TOOL_CALL",`BROWSER_MODEL_NO_TOOL_CALL: o modelo concluiu duas respostas sem ferramenta válida. Diagnóstico sanitizado: structured=${result.diagnostic.structuredToolCallCount}; qwenMarkup=${result.diagnostic.fallbackToolCallCount}; invalidMarkup=${result.diagnostic.invalidToolCallMarkupCount}; contentLength=${result.diagnostic.assistantContentLength}; thinkingLength=${result.diagnostic.thinkingLength}; tools=${result.diagnostic.toolNames.join(",")||"nenhuma"}.`);
        }
        textEmitter.end();output.stopReason=finalReason==="length"?"length":"stop";stream.push({type:"done",reason:output.stopReason,message:output});stream.end();
      }catch(error){
        textEmitter.end();const aborted=options?.signal?.aborted||isAbortError(error);output.stopReason=aborted?"aborted":"error";output.errorMessage=aborted?"A chamada ao Ollama nativo foi interrompida.":error instanceof Error?error.message:String(error);stream.push({type:"error",reason:output.stopReason,error:output});stream.end();
      }
    })();
    return stream;
  };
}

async function runTurn(input:{base:string;modelId:string;model:Model<any>;context:Context;options?:SimpleStreamOptions;transport:TransportOptions;stream:ReturnType<typeof createAssistantMessageEventStream>;output:AssistantMessage;textEmitter:TextEmitter;allowed:Set<string>;recoveryAttempt:boolean}):Promise<TurnResult>{
  const started=Date.now();
  const modelTimeout=input.transport.modelTurnTimeoutMs??input.options?.timeoutMs??DEFAULT_MODEL_TURN_TIMEOUT_MS;
  const timeoutSignal=AbortSignal.timeout(modelTimeout),signal=input.options?.signal?AbortSignal.any([input.options.signal,timeoutSignal]):timeoutSignal;
  let response:Response;
  try{response=await (input.options?.fetch??fetch)(`${input.base}/api/chat`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(buildRequest(input.modelId,input.model,input.context,input.options,input.recoveryAttempt)),signal});}
  catch(error){if(timeoutSignal.aborted&&!input.options?.signal?.aborted)throw new BrowserModelTransportError("BROWSER_MODEL_TURN_TIMEOUT",`BROWSER_MODEL_TURN_TIMEOUT: o turno excedeu ${modelTimeout} ms.`);throw error;}
  await input.options?.onResponse?.({status:response.status,headers:Object.fromEntries(response.headers.entries())},input.model);
  if(!response.ok)throw new Error(`O endpoint nativo /api/chat do Ollama respondeu com HTTP ${response.status}.`);
  if(!response.body)throw new Error("O endpoint nativo /api/chat do Ollama não retornou um stream.");

  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",firstChunkMs:number|null=null,rawContent="",thinkingLength=0,doneReason="stop",promptTokens=0,completionTokens=0;const structured:unknown[]=[],emitted=new Set<string>();
  try{
    let firstRead=true;
    while(true){
      let packet:ReadableStreamReadResult<Uint8Array>;
      try{packet=await readPacket(reader,firstRead?input.transport.firstChunkTimeoutMs??DEFAULT_FIRST_CHUNK_TIMEOUT_MS:undefined);}
      catch(error){if(error instanceof BrowserModelTransportError)throw error;if(timeoutSignal.aborted&&!input.options?.signal?.aborted)throw new BrowserModelTransportError("BROWSER_MODEL_TURN_TIMEOUT",`BROWSER_MODEL_TURN_TIMEOUT: o turno excedeu ${modelTimeout} ms.`);throw error;}
      if(packet.done)break;
      if(firstRead){firstRead=false;firstChunkMs=Date.now()-started;}
      buffer+=decoder.decode(packet.value,{stream:true});
      const lines=buffer.split(/\r?\n/);buffer=lines.pop()??"";
      for(const line of lines)if(line.trim())processChunk(parseChunk(line));
    }
    buffer+=decoder.decode();if(buffer.trim())processChunk(parseChunk(buffer));
  }finally{reader.releaseLock();}

  const inspection=inspectOllamaToolCalls({content:rawContent,thinking:"x".repeat(thinkingLength),tool_calls:structured},input.allowed);
  for(const call of inspection.calls){const key=callKey(call.name,call.arguments);if(!emitted.has(key)){emitted.add(key);emitToolCall(input.stream,input.output,call);}}
  return{validToolCalls:emitted.size,diagnostic:inspection.diagnostic,doneReason,firstChunkMs,durationMs:Date.now()-started,promptTokens,completionTokens};

  function processChunk(chunk:OllamaChatChunk){
    const message=chunk.message&&typeof chunk.message==="object"?chunk.message:undefined;
    const content=typeof message?.content==="string"?message.content:"";rawContent+=content;input.textEmitter.feed(content);
    if(typeof message?.thinking==="string")thinkingLength+=message.thinking.length;
    if(Array.isArray(message?.tool_calls)){
      structured.push(...message.tool_calls);
      const partial=inspectOllamaToolCalls({content:"",tool_calls:message.tool_calls},input.allowed);
      for(const call of partial.calls){const key=callKey(call.name,call.arguments);if(!emitted.has(key)){emitted.add(key);emitToolCall(input.stream,input.output,call);}}
    }
    if(typeof chunk.done_reason==="string")doneReason=chunk.done_reason;
    promptTokens=Math.max(promptTokens,numeric(chunk.prompt_eval_count));completionTokens=Math.max(completionTokens,numeric(chunk.eval_count));
  }
}

function buildRequest(modelId:string,model:Model<any>,context:Context,options:SimpleStreamOptions|undefined,recovery:boolean){
  const messages=toOllamaMessages(context);
  if(recovery){const completion=discoverCompletionTool(context);messages.push({role:"user",content:`${RECOVERY_INSTRUCTION} Available tools: ${(context.tools??[]).map(tool=>tool.name).join(", ")}.${completion?` If the task is already complete, call ${completion}.`:""}`});}
  return{model:modelId,messages,tools:(context.tools??[]).map(tool=>({type:"function",function:{name:tool.name,description:tool.description,parameters:tool.parameters}})),stream:true,options:{temperature:options?.temperature??0,num_predict:Math.min(options?.maxTokens??model.maxTokens,2_048)}};
}
function discoverCompletionTool(context:Context){return(context.tools??[]).map(tool=>tool.name).find(name=>/(^|_)(done|complete|finish|final|submit)(_|$)/i.test(name));}
function toOllamaMessages(context:Context):OllamaMessage[]{const messages:OllamaMessage[]=[];if(context.systemPrompt?.trim())messages.push({role:"system",content:context.systemPrompt});for(const message of context.messages){if(message.role==="user"){const content=flattenContent(message.content),converted:OllamaMessage={role:"user",content:content.text};if(content.images.length)converted.images=content.images;messages.push(converted);}else if(message.role==="assistant"){const text=message.content.filter(block=>block.type==="text").map(block=>block.text).join("\n"),toolCalls=message.content.filter((block):block is ToolCall=>block.type==="toolCall").map(block=>({type:"function" as const,function:{name:block.name,arguments:block.arguments}})),converted:OllamaMessage={role:"assistant",content:text};if(toolCalls.length)converted.tool_calls=toolCalls;messages.push(converted);}else{const content=flattenContent(message.content),converted:OllamaMessage={role:"tool",tool_name:message.toolName,content:content.text};if(content.images.length)converted.images=content.images;messages.push(converted);}}return messages;}
function flattenContent(content:Context["messages"][number]["content"]){if(typeof content==="string")return{text:content,images:[] as string[]};const text:string[]=[],images:string[]=[];for(const block of content){if(block.type==="text")text.push(block.text);else if(block.type==="image")images.push(block.data);}return{text:text.join("\n"),images};}

class TextEmitter{
  private buffer="";private block?:{type:"text";text:string};private index=-1;private ended=false;
  constructor(private stream:ReturnType<typeof createAssistantMessageEventStream>,private output:AssistantMessage){}
  feed(delta:string){if(!delta)return;this.buffer+=delta;while(this.buffer){const open=this.buffer.search(/<tool_call>/i);if(open>=0){this.emit(this.buffer.slice(0,open));const close=this.buffer.search(/<\/tool_call>/i);if(close<0){this.buffer=this.buffer.slice(open);return;}this.buffer=this.buffer.slice(close+"</tool_call>".length);continue;}const hold=partialTagSuffix(this.buffer,"<tool_call>");this.emit(this.buffer.slice(0,this.buffer.length-hold));this.buffer=this.buffer.slice(this.buffer.length-hold);return;}}
  end(){if(this.ended)return;this.ended=true;if(!/<tool_call>/i.test(this.buffer))this.emit(this.buffer);this.buffer="";if(this.block)this.stream.push({type:"text_end",contentIndex:this.index,content:this.block.text,partial:this.output});}
  private emit(delta:string){if(!delta)return;if(!this.block){this.index=this.output.content.length;this.block={type:"text",text:""};this.output.content.push(this.block);this.stream.push({type:"text_start",contentIndex:this.index,partial:this.output});}this.block.text+=delta;this.stream.push({type:"text_delta",contentIndex:this.index,delta,partial:this.output});}
}
function partialTagSuffix(value:string,tag:string){const lower=value.toLowerCase(),target=tag.toLowerCase();for(let size=Math.min(lower.length,target.length-1);size>0;size--)if(lower.endsWith(target.slice(0,size)))return size;return 0;}
function emitToolCall(stream:ReturnType<typeof createAssistantMessageEventStream>,output:AssistantMessage,call:{name:string;arguments:Record<string,unknown>}){const contentIndex=output.content.length,toolCall:ToolCall={type:"toolCall",id:`ollama-${randomUUID()}`,name:call.name,arguments:call.arguments};output.content.push(toolCall);stream.push({type:"toolcall_start",contentIndex,partial:output});stream.push({type:"toolcall_end",contentIndex,toolCall,partial:output});}
function createOutput(model:Model<any>):AssistantMessage{return{role:"assistant",content:[],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"pending",timestamp:Date.now()};}
function applyUsage(output:AssistantMessage,input:number,generated:number){output.usage.input+=input;output.usage.output+=generated;output.usage.totalTokens=output.usage.input+output.usage.output;}
function parseChunk(line:string){try{return JSON.parse(line) as OllamaChatChunk;}catch(error){throw new Error("O endpoint nativo /api/chat do Ollama retornou NDJSON inválido.",{cause:error});}}
async function readPacket(reader:ReadableStreamDefaultReader<Uint8Array>,timeoutMs?:number){if(!timeoutMs)return reader.read();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new BrowserModelTransportError("BROWSER_PROVIDER_FIRST_CHUNK_TIMEOUT",`BROWSER_PROVIDER_FIRST_CHUNK_TIMEOUT: nenhum chunk foi recebido em ${timeoutMs} ms.`));void reader.cancel();},timeoutMs);})]);}finally{if(timer)clearTimeout(timer);}}
function callKey(name:string,args:Record<string,unknown>){return`${name}:${JSON.stringify(args)}`;}
function numeric(value:unknown){return typeof value==="number"&&Number.isFinite(value)?Math.max(0,value):0;}
function isAbortError(error:unknown){return Boolean(error&&typeof error==="object"&&["AbortError","TimeoutError"].includes(String((error as {name?:unknown}).name)));}
