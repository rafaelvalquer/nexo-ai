import type { AgentModelTurn, AgentTurnRequest, LLMMessage, LLMProvider, StructuredPlanRequest } from "./provider.js";
import { structuredAgentTurn } from "./agent/structured-agent-turn.js";
import { DEFAULT_TIMEOUTS } from "../config/defaults.js";
import { OllamaConnectionError, OllamaTimeoutError, OllamaUnavailableError, OllamaInvalidResponseError } from "./errors.js";
import { LLM_STREAM_CONTENT_STARTED, LLM_STREAM_THINKING_STARTED } from "./stream-events.js";
import type { ResourceManager } from "../runtime/resource-manager.js";
import { parseStructuredJson } from "./structured-response-parser.js";
import type { LocalMetricsService } from "../observability/metrics.js";

const DEFAULT_KEEP_ALIVE = "10m";

export class OllamaProvider implements LLMProvider {
  private intentModel?: string;

  constructor(
    private baseUrl: string,
    private model: string,
    private resources?: ResourceManager,
    intentModel?: string,
    private metrics?: LocalMetricsService
  ) {
    this.intentModel = intentModel?.trim() || process.env.NEXO_INTENT_MODEL?.trim() || undefined;
  }

  setModel(model: string) { this.model = model; }
  setIntentModel(model?: string) { this.intentModel = model?.trim() || undefined; }
  setBaseUrl(url: string) { this.baseUrl = url.replace(/\/$/, ""); }
  setResourceManager(resources: ResourceManager) { this.resources = resources; }
  setMetrics(metrics:LocalMetricsService){this.metrics=metrics;}

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(DEFAULT_TIMEOUTS.health) });
      return { ok: res.ok, detail: res.ok ? "Ollama disponível" : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "Ollama indisponível" };
    }
  }

  async models() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(DEFAULT_TIMEOUTS.health) });
      if (!res.ok) return [];
      const json = await res.json() as { models?: { name: string }[] };
      return (json.models ?? []).map(x => x.name);
    } catch {
      return [];
    }
  }

  async pullModel(model: string, onProgress?: (value: { status: string; completed?: number; total?: number }) => void) {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal: AbortSignal.timeout(30 * 60_000)
    });
    if (!res.ok || !res.body) throw new Error(`Não foi possível baixar o modelo: HTTP ${res.status}`);
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    const consume = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
      if (event.error) throw new Error(event.error);
      onProgress?.({ status: event.status ?? "Baixando modelo…", completed: event.completed, total: event.total });
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    return { ok: true, model };
  }

  private signal(signal: AbortSignal | undefined, timeoutMs: number) {
    return signal ?? AbortSignal.timeout(timeoutMs);
  }

  private handleError(e: any, phase: string, timeoutMs: number, external?: AbortSignal): never {
    if (external?.aborted) throw external.reason ?? new DOMException("Cancelado", "AbortError");
    if (e?.name === "AbortError" || e?.name === "TimeoutError") throw new OllamaTimeoutError(phase, this.model, Math.round(timeoutMs / 1000));
    if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) throw new OllamaConnectionError();
    throw new OllamaUnavailableError(e instanceof Error ? e.message : String(e));
  }

  private scheduled<T>(work: () => Promise<T>, signal?: AbortSignal) {
    return this.resources ? this.resources.withLlm(work, signal) : work();
  }

  async chat(messages: LLMMessage[], signal?: AbortSignal) {
    return this.scheduled(async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: this.model, stream: false, messages, keep_alive: DEFAULT_KEEP_ALIVE }),
          signal: this.signal(signal, DEFAULT_TIMEOUTS.chat)
        });
        if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
        const data = await res.json() as { message?: { content?: string } };
        if (!data.message?.content) throw new OllamaInvalidResponseError();
        return data.message.content;
      } catch (e) {
        return this.handleError(e, "chat", DEFAULT_TIMEOUTS.chat, signal);
      }
    }, signal);
  }

  async plan(messages: LLMMessage[], signal?: AbortSignal) {
    return this.scheduled(async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            stream: false,
            messages,
            think: false,
            keep_alive: DEFAULT_KEEP_ALIVE,
            options: { temperature: .1 }
          }),
          signal: this.signal(signal, DEFAULT_TIMEOUTS.planner)
        });
        if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
        const data = await res.json() as { message?: { content?: string } };
        if (!data.message?.content) throw new OllamaInvalidResponseError();
        return data.message.content;
      } catch (e) {
        return this.handleError(e, "planejamento", DEFAULT_TIMEOUTS.planner, signal);
      }
    }, signal);
  }

  async agentTurn(request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentModelTurn> {
    return this.scheduled(async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: request.model?.trim() || this.model, stream: false, think: false, keep_alive: DEFAULT_KEEP_ALIVE,
            messages: request.messages.map(message => ({ role: message.role, content: message.content, ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}) })),
            tools: request.tools.map(tool => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters ?? { type: "object", properties: {} } } })), options: { temperature: 0 } }),
          signal: this.signal(signal, DEFAULT_TIMEOUTS.tool_reasoning)
        });
        if (!res.ok) {
          // Older Ollama/model combinations reject tools. Their structured JSON capability remains safe.
          if ([400, 404, 422].includes(res.status)){this.metrics?.record("agent.structured_fallback",1,{status:res.status});return structuredAgentTurn(this as Required<Pick<LLMProvider, "planStructured">>, request, signal);}
          throw new Error(`Ollama respondeu HTTP ${res.status}`);
        }
        const data = await res.json() as { message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } };
        if (!data.message) throw new OllamaInvalidResponseError("Ollama não retornou uma mensagem de agent turn.");
        const toolCalls = (data.message.tool_calls ?? []).map((call, index) => {
          if (!call.function?.name || !call.function.arguments || typeof call.function.arguments !== "object" || Array.isArray(call.function.arguments)) throw new OllamaInvalidResponseError("Tool call inválida retornada pelo Ollama.");
          return { id: call.id ?? `ollama-${index}`, name: call.function.name, arguments: call.function.arguments as Record<string, unknown> };
        });
          this.metrics?.record("agent.native_tool_calling",1,{toolCalls:toolCalls.length});return { ...(data.message.content ? { content: data.message.content } : {}), toolCalls };
      } catch (error) {
        if (error instanceof OllamaInvalidResponseError) throw error;
        return this.handleError(error, "agent turn", DEFAULT_TIMEOUTS.tool_reasoning, signal);
      }
    }, signal);
  }

  async planStructured<T>(request: StructuredPlanRequest<T>, signal?: AbortSignal): Promise<T> {
    return this.scheduled(async () => {
      const preferredModel = request.model?.trim() || this.intentModel || this.model;
      const invoke = async (model: string, repair = false) => {
        const messages = repair
          ? [
              ...request.messages,
              { role: "system" as const, content: "A resposta anterior não respeitou o schema. Retorne somente um objeto JSON compatível com o schema fornecido, sem markdown, comentários ou texto adicional." }
            ]
          : request.messages;
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages,
            think: false,
            format: request.schema,
            keep_alive: DEFAULT_KEEP_ALIVE,
            options: { temperature: 0 }
          }),
          signal: this.signal(signal, DEFAULT_TIMEOUTS.planner)
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const error = new Error(`Ollama respondeu HTTP ${res.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
          (error as any).status = res.status;
          throw error;
        }
        const data = await res.json() as { message?: { content?: string } };
        if (!data.message?.content) throw new OllamaInvalidResponseError("Ollama não retornou conteúdo estruturado.");
        return request.parse(parseStructuredJson(data.message.content));
      };

      try {
        try {
          return await invoke(preferredModel, false);
        } catch (firstError: any) {
          if (firstError?.status === 404 && preferredModel !== this.model) return await invoke(this.model, false);
          try {
            return await invoke(preferredModel, true);
          } catch (secondError: any) {
            if (secondError?.status === 404 && preferredModel !== this.model) return await invoke(this.model, true);
            throw secondError;
          }
        }
      } catch (e) {
        return this.handleError(e, `planejamento estruturado${request.schemaName ? ` (${request.schemaName})` : ""}`, DEFAULT_TIMEOUTS.planner, signal);
      }
    }, signal);
  }

  async summarize(text: string) {
    return this.scheduled(async () => {
      try {
        const messages: LLMMessage[] = [{ role: "user", content: `Faça um resumo do seguinte texto:\n\n${text}` }];
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: this.model, stream: false, messages, keep_alive: DEFAULT_KEEP_ALIVE }),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUTS.summarize)
        });
        if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
        const data = await res.json() as { message?: { content?: string } };
        return data.message?.content ?? "";
      } catch (e) {
        return this.handleError(e, "resumo", DEFAULT_TIMEOUTS.summarize);
      }
    });
  }

  async embed(text: string) {
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUTS.embeddings)
      });
      if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
      const data = await res.json() as { embedding?: number[] };
      return data.embedding ?? [];
    } catch (e) {
      return this.handleError(e, "embeddings", DEFAULT_TIMEOUTS.embeddings);
    }
  }

  async stream(messages: LLMMessage[], onToken: (token: string) => void, signal?: AbortSignal) {
    return this.scheduled(async () => {
      const controller = signal ? undefined : new AbortController();
      const timeout = controller ? setTimeout(() => controller.abort(new Error("Timeout")), DEFAULT_TIMEOUTS.chat) : undefined;
      try {
        const effective = signal ?? controller!.signal;
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: this.model, stream: true, messages, keep_alive: DEFAULT_KEEP_ALIVE }),
          signal: effective
        });
        if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
        if (!res.body) throw new Error("Ollama não retornou um stream de resposta.");
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = "", full = "", thinkingStarted = false, contentStarted = false;
        const consumeLine = (line: string) => {
          const clean = line.trim();
          if (!clean) return;
          let payload: { message?: { content?: string; thinking?: string }; error?: string };
          try { payload = JSON.parse(clean); } catch { return; }
          if (payload.error) throw new Error(payload.error);
          const thinking = payload.message?.thinking ?? "";
          if (thinking && !thinkingStarted) { thinkingStarted = true; onToken(LLM_STREAM_THINKING_STARTED); }
          const token = payload.message?.content ?? "";
          if (token) {
            if (!contentStarted) { contentStarted = true; onToken(LLM_STREAM_CONTENT_STARTED); }
            full += token;
            onToken(token);
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);
        return full;
      } catch (e) {
        return this.handleError(e, "chat", DEFAULT_TIMEOUTS.chat, signal);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }, signal);
  }
}
