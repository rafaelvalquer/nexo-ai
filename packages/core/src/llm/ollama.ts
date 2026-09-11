import type { LLMMessage, LLMProvider } from "./provider.js";

export class OllamaProvider implements LLMProvider {
  constructor(private baseUrl: string, private model: string) {}

  setModel(model: string) { this.model = model; }
  setBaseUrl(url: string) { this.baseUrl = url.replace(/\/$/, ""); }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
      return { ok: res.ok, detail: res.ok ? "Ollama disponível" : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "Ollama indisponível" };
    }
  }

  async models() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return [];
      const json = await res.json() as { models?: { name: string }[] };
      return (json.models ?? []).map(x => x.name);
    } catch { return []; }
  }

  async chat(messages: LLMMessage[]) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, stream: false, messages }),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
    const data = await res.json() as { message?: { content?: string } };
    return data.message?.content ?? "";
  }

  async stream(messages: LLMMessage[], onToken: (token: string) => void) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: true, messages }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status}`);
      if (!res.body) throw new Error("Ollama não retornou um stream de resposta.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      const consumeLine = (line: string) => {
        const clean = line.trim();
        if (!clean) return;
        let payload: { message?: { content?: string }; error?: string };
        try { payload = JSON.parse(clean); }
        catch { return; }
        if (payload.error) throw new Error(payload.error);
        const token = payload.message?.content ?? "";
        if (token) {
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
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Ollama excedeu o tempo limite de 120 segundos.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
