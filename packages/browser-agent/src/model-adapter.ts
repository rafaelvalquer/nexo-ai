import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

/** Adapts the Nexo Ollama endpoint to Pi's model catalog without any cloud dependency. */
export class NexoBrowserModelAdapter {
  constructor(private readonly ollamaUrl: string, private readonly modelId: string) {}

  async createModels(signal?: AbortSignal) {
    const base = this.ollamaUrl.replace(/\/$/, "");
    const supportsVision = await this.detectVision(base, signal);
    const model: Model<"openai-completions"> = {
      id: this.modelId,
      name: `${this.modelId} (Nexo/Ollama)`,
      api: "openai-completions",
      provider: "ollama",
      baseUrl: `${base}/v1`,
      reasoning: false,
      input: supportsVision ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32_768,
      maxTokens: 8_192,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStore: false,
        supportsUsageInStreaming: false,
        supportsStrictMode: false
      }
    };
    const provider = createProvider({
      id: "ollama",
      name: "Ollama local do Nexo",
      baseUrl: `${base}/v1`,
      auth: { apiKey: { name: "Ollama local", resolve: async () => ({ auth: {} }) } },
      models: [model],
      api: openAICompletionsApi()
    });
    const models = createModels();
    models.setProvider(provider);
    return { models, model: `ollama/${this.modelId}` };
  }

  private async detectVision(base: string, signal?: AbortSignal) {
    try {
      const response = await fetch(`${base}/api/show`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.modelId }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3_000)]) : AbortSignal.timeout(3_000)
      });
      if (!response.ok) return false;
      const body = await response.json() as { capabilities?: string[] };
      return body.capabilities?.includes("vision") ?? false;
    } catch {
      return false;
    }
  }
}
