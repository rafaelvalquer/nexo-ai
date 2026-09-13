import type { LLMMessage, LLMProvider } from "./provider.js";
import { DEFAULT_TIMEOUTS } from "../config/defaults.js";
import { OllamaConnectionError, OllamaTimeoutError, OllamaUnavailableError, OllamaInvalidResponseError } from "./errors.js";
import { LLM_STREAM_CONTENT_STARTED, LLM_STREAM_THINKING_STARTED } from "./stream-events.js";

const DEFAULT_KEEP_ALIVE = "10m";

export class OllamaProvider implements LLMProvider {
  constructor(private baseUrl: string, private model: string) {}

  setModel(model: string) { this.model = model; }
  setBaseUrl(url: string) { this.baseUrl = url.replace(/\/$/, ""); }

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
    } catch { return []; }
  }

  private handleError(e: any, phase: string, timeoutMs: number) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw new OllamaTimeoutError(phase, this.model, Math.round(timeoutMs / 1000));
    }
    if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch failed')) {
      throw new OllamaConnectionError();
    }
    throw new OllamaUnavailableError(e instanceof Error ? e.message : String(e));
  }

  async chat(messages: LLMMessage[], signal?: AbortSignal) {
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: false, messages, keep_alive: DEFAULT_KEEP_ALIVE }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_TIMEOUTS.chat)]) : AbortSignal.timeout(DEFAULT_TIMEOUTS.chat)
      });
      if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
      const data = await res.json() as { message?: { content?: string } };
      if (!data.message?.content) throw new OllamaInvalidResponseError();
      return data.message.content;
    } catch (e) {
      this.handleError(e, "chat", DEFAULT_TIMEOUTS.chat);
      throw e;
    }
  }

  async plan(messages: LLMMessage[], signal?: AbortSignal) {
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
          options: { temperature: 0.1 }
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_TIMEOUTS.planner)]) : AbortSignal.timeout(DEFAULT_TIMEOUTS.planner)
      });
      if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
      const data = await res.json() as { message?: { content?: string } };
      if (!data.message?.content) throw new OllamaInvalidResponseError();
      return data.message.content;
    } catch (e) {
      this.handleError(e, "planejamento", DEFAULT_TIMEOUTS.planner);
      throw e;
    }
  }

  async summarize(text: string) {
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
      this.handleError(e, "resumo", DEFAULT_TIMEOUTS.summarize);
      throw e;
    }
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
      this.handleError(e, "embeddings", DEFAULT_TIMEOUTS.embeddings);
      throw e;
    }
  }

  async stream(messages: LLMMessage[], onToken: (token: string) => void, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Timeout")), DEFAULT_TIMEOUTS.chat);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: true, messages, keep_alive: DEFAULT_KEEP_ALIVE }),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      });
      if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
      if (!res.body) throw new Error("Ollama não retornou um stream de resposta.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let thinkingStarted = false;
      let contentStarted = false;

      const consumeLine = (line: string) => {
        const clean = line.trim();
        if (!clean) return;
        let payload: { message?: { content?: string; thinking?: string }; error?: string };
        try { payload = JSON.parse(clean); }
        catch { return; }
        if (payload.error) throw new Error(payload.error);

        const thinking = payload.message?.thinking ?? "";
        if (thinking && !thinkingStarted) {
          thinkingStarted = true;
          onToken(LLM_STREAM_THINKING_STARTED);
        }

        const token = payload.message?.content ?? "";
        if (token) {
          if (!contentStarted) {
            contentStarted = true;
            onToken(LLM_STREAM_CONTENT_STARTED);
          }
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
    } catch (e: any) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelado", "AbortError");
      if (controller.signal.aborted) {
        throw new OllamaTimeoutError("chat", this.model, Math.round(DEFAULT_TIMEOUTS.chat / 1000));
      }
      this.handleError(e, "chat", DEFAULT_TIMEOUTS.chat);
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
