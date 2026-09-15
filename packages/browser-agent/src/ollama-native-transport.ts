import { randomUUID } from "node:crypto";
import type { StreamFn } from "@browser_use/pi";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ToolCall
} from "@earendil-works/pi-ai";
import { inspectOllamaToolCalls } from "./tool-call-compat.js";

const DEFAULT_MODEL_TIMEOUT_MS = 300_000;

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_name?: string;
  tool_calls?: OllamaToolCall[];
};

type OllamaToolCall = {
  type: "function";
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

type OllamaChatResponse = {
  message?: {
    role?: unknown;
    content?: unknown;
    thinking?: unknown;
    tool_calls?: unknown;
  };
  done_reason?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
};

/**
 * Browser-Agent-only Pi transport backed by Ollama's native /api/chat endpoint.
 * The rest of Nexo can continue using the OpenAI-compatible endpoint unchanged.
 */
export function createOllamaNativeStreamFn(ollamaUrl: string, configuredModelId: string): StreamFn {
  const base = ollamaUrl.replace(/\/$/, "");

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const output = createOutput(model);

    void (async () => {
      stream.push({ type:"start", partial:output });
      try {
        const fetchImpl = options?.fetch ?? fetch;
        const response = await fetchImpl(`${base}/api/chat`, {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify(buildRequest(configuredModelId || model.id, model, context, options)),
          signal:boundedSignal(options?.signal, options?.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS)
        });

        await options?.onResponse?.({
          status:response.status,
          headers:Object.fromEntries(response.headers.entries())
        }, model);

        if (!response.ok) {
          throw new Error(`O endpoint nativo /api/chat do Ollama respondeu com HTTP ${response.status}.`);
        }

        let payload:OllamaChatResponse;
        try {
          payload = await response.json() as OllamaChatResponse;
        } catch (error) {
          throw new Error("O endpoint nativo /api/chat do Ollama retornou JSON inválido.", { cause:error });
        }

        applyUsage(output, payload);
        const message = payload.message;
        if (!message || typeof message !== "object") {
          throw new Error("O endpoint nativo /api/chat do Ollama não retornou uma mensagem de assistente.");
        }

        const allowedToolNames = new Set((context.tools ?? []).map(tool => tool.name));
        const inspection = inspectOllamaToolCalls(message, allowedToolNames);
        if (inspection.sanitizedContent.length > 0) emitText(stream, output, inspection.sanitizedContent);
        for (const call of inspection.calls) emitToolCall(stream, output, call);

        output.stopReason = inspection.calls.length > 0
          ? "toolUse"
          : payload.done_reason === "length" ? "length" : "stop";

        stream.push({ type:"done", reason:output.stopReason, message:output });
        stream.end();
      } catch (error) {
        const aborted = options?.signal?.aborted || isAbortError(error);
        const reason = aborted ? "aborted" as const : "error" as const;
        output.stopReason = reason;
        output.errorMessage = aborted
          ? "A chamada ao Ollama nativo foi interrompida."
          : error instanceof Error ? error.message : String(error);
        stream.push({ type:"error", reason, error:output });
        stream.end();
      }
    })();

    return stream;
  };
}

function buildRequest(modelId:string, model:Model<any>, context:Context, options?:SimpleStreamOptions) {
  const nativeOptions:Record<string, number> = {
    temperature:options?.temperature ?? 0,
    num_predict:options?.maxTokens ?? model.maxTokens
  };

  return {
    model:modelId,
    messages:toOllamaMessages(context),
    tools:(context.tools ?? []).map(tool => ({
      type:"function",
      function:{
        name:tool.name,
        description:tool.description,
        parameters:tool.parameters
      }
    })),
    stream:false,
    options:nativeOptions
  };
}

function toOllamaMessages(context:Context):OllamaMessage[] {
  const messages:OllamaMessage[] = [];
  if (context.systemPrompt?.trim()) {
    messages.push({ role:"system", content:context.systemPrompt });
  }

  for (const message of context.messages) {
    if (message.role === "user") {
      const content = flattenContent(message.content);
      const converted:OllamaMessage = { role:"user", content:content.text };
      if (content.images.length) converted.images = content.images;
      messages.push(converted);
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("\n");
      const toolCalls = message.content
        .filter((block):block is ToolCall => block.type === "toolCall")
        .map(block => ({
          type:"function" as const,
          function:{ name:block.name, arguments:block.arguments }
        }));
      const converted:OllamaMessage = { role:"assistant", content:text };
      if (toolCalls.length) converted.tool_calls = toolCalls;
      messages.push(converted);
      continue;
    }

    const content = flattenContent(message.content);
    const converted:OllamaMessage = {
      role:"tool",
      tool_name:message.toolName,
      content:content.text
    };
    if (content.images.length) converted.images = content.images;
    messages.push(converted);
  }

  return messages;
}

function flattenContent(content:Context["messages"][number]["content"]) {
  if (typeof content === "string") return { text:content, images:[] as string[] };
  const text:string[] = [];
  const images:string[] = [];
  for (const block of content) {
    if (block.type === "text") text.push(block.text);
    else if (block.type === "image") images.push(block.data);
  }
  return { text:text.join("\n"), images };
}

function emitText(stream:ReturnType<typeof createAssistantMessageEventStream>, output:AssistantMessage, text:string) {
  const contentIndex = output.content.length;
  const block = { type:"text" as const, text:"" };
  output.content.push(block);
  stream.push({ type:"text_start", contentIndex, partial:output });
  block.text = text;
  stream.push({ type:"text_delta", contentIndex, delta:text, partial:output });
  stream.push({ type:"text_end", contentIndex, content:text, partial:output });
}

function emitToolCall(
  stream:ReturnType<typeof createAssistantMessageEventStream>,
  output:AssistantMessage,
  call:{name:string;arguments:Record<string,unknown>}
) {
  const contentIndex = output.content.length;
  const toolCall:ToolCall = {
    type:"toolCall",
    id:`ollama-${randomUUID()}`,
    name:call.name,
    arguments:call.arguments
  };
  output.content.push(toolCall);
  stream.push({ type:"toolcall_start", contentIndex, partial:output });
  stream.push({ type:"toolcall_end", contentIndex, toolCall, partial:output });
}

function createOutput(model:Model<any>):AssistantMessage {
  return {
    role:"assistant",
    content:[],
    api:model.api,
    provider:model.provider,
    model:model.id,
    usage:{
      input:0,
      output:0,
      cacheRead:0,
      cacheWrite:0,
      totalTokens:0,
      cost:{ input:0, output:0, cacheRead:0, cacheWrite:0, total:0 }
    },
    stopReason:"pending",
    timestamp:Date.now()
  };
}

function applyUsage(output:AssistantMessage, payload:OllamaChatResponse) {
  const input = numeric(payload.prompt_eval_count);
  const generated = numeric(payload.eval_count);
  output.usage.input = input;
  output.usage.output = generated;
  output.usage.totalTokens = input + generated;
}

function numeric(value:unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function boundedSignal(signal:AbortSignal|undefined, timeoutMs:number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isAbortError(error:unknown) {
  return Boolean(error && typeof error === "object" && ["AbortError","TimeoutError"].includes(String((error as {name?:unknown}).name)));
}
