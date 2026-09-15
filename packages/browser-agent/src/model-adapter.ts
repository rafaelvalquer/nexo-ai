import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { BrowserAgentErrorCode } from "@nexo/shared/browser-agent";

/**
 * pi-ai's OpenAI-compatible transport requires a non-empty API key (or auth header)
 * before it sends a request. Ollama itself does not require authentication, so Nexo
 * supplies a deterministic compatibility token that never represents a real secret.
 */
export const NEXO_OLLAMA_COMPAT_API_KEY = "nexo-local-ollama";
const PREFLIGHT_TOOL_NAME = "nexo_browser_preflight";
const PREFLIGHT_URL = "https://example.com";

export type OllamaPreflightResult = {
  available: true;
  modelExists: true;
  toolCallingValidated: true;
  capabilities: string[];
  latencyMs: number;
  compatibilityLatencyMs: number;
};

export class BrowserAgentPreflightError extends Error {
  constructor(public readonly code: BrowserAgentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrowserAgentPreflightError";
  }
}

/** Adapts the Nexo Ollama endpoint to Pi's model catalog without any cloud dependency. */
export class NexoBrowserModelAdapter {
  constructor(private readonly ollamaUrl: string, private readonly modelId: string) {}

  async preflight(signal?: AbortSignal): Promise<OllamaPreflightResult> {
    const base = this.ollamaUrl.replace(/\/$/, "");
    const showStarted = Date.now();
    let response: Response;
    try {
      response = await fetch(`${base}/api/show`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.modelId }),
        signal: boundedSignal(signal, 10_000)
      });
    } catch (error) {
      throw classifyFetchError(error, "Não foi possível conectar ao Ollama local.");
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new BrowserAgentPreflightError("BROWSER_MODEL_NOT_FOUND", `O modelo ${this.modelId} não foi encontrado no Ollama.`);
      }
      throw new BrowserAgentPreflightError("BROWSER_OLLAMA_UNAVAILABLE", `O Ollama respondeu com HTTP ${response.status} ao verificar o modelo.`);
    }

    let body: { capabilities?: unknown };
    try {
      body = await response.json() as { capabilities?: unknown };
    } catch (error) {
      throw new BrowserAgentPreflightError("BROWSER_MODEL_INVALID_RESPONSE", "O Ollama retornou uma resposta inválida ao verificar o modelo.", { cause:error });
    }
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter((item): item is string => typeof item === "string") : [];
    const latencyMs = Date.now() - showStarted;

    const compatibilityStarted = Date.now();
    let compatibilityResponse: Response;
    try {
      compatibilityResponse = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${NEXO_OLLAMA_COMPAT_API_KEY}`
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            {
              role: "system",
              content: "You are a capability probe. You must call the provided function. Do not answer with natural language."
            },
            {
              role: "user",
              content: `Call ${PREFLIGHT_TOOL_NAME} with url exactly ${PREFLIGHT_URL}.`
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: PREFLIGHT_TOOL_NAME,
              description: "Capability probe for Browser Agent tool calling.",
              parameters: {
                type: "object",
                properties: { url: { type: "string" } },
                required: ["url"],
                additionalProperties: false
              }
            }
          }],
          stream: false,
          temperature: 0,
          max_tokens: 256
        }),
        signal: boundedSignal(signal, 20_000)
      });
    } catch (error) {
      throw classifyFetchError(error, "O Ollama não concluiu o preflight de tool calling do Browser Agent.");
    }

    if (!compatibilityResponse.ok) {
      if (compatibilityResponse.status === 404) {
        throw new BrowserAgentPreflightError("BROWSER_MODEL_NOT_FOUND", `O modelo ${this.modelId} não foi encontrado durante o teste de tool calling.`);
      }
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_INCOMPATIBLE",
        `O endpoint OpenAI-compatible do Ollama respondeu com HTTP ${compatibilityResponse.status} durante o teste de tool calling.`
      );
    }

    let compatibility: unknown;
    try {
      compatibility = await compatibilityResponse.json();
    } catch (error) {
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_INVALID_RESPONSE",
        "O endpoint OpenAI-compatible do Ollama retornou uma resposta inválida durante o preflight de tool calling.",
        { cause:error }
      );
    }

    if (!hasExpectedToolCall(compatibility)) {
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_TOOL_CALL_UNSUPPORTED",
        `O modelo ${this.modelId} respondeu ao endpoint OpenAI-compatible, mas não produziu o tool call exigido pelo Browser Agent.`
      );
    }

    return {
      available:true,
      modelExists:true,
      toolCallingValidated:true,
      capabilities,
      latencyMs,
      compatibilityLatencyMs:Date.now() - compatibilityStarted
    };
  }

  async createModels(signal?: AbortSignal, preflight?: OllamaPreflightResult) {
    const base = this.ollamaUrl.replace(/\/$/, "");
    const supportsVision = preflight ? preflight.capabilities.includes("vision") : await this.detectVision(base, signal);
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
      auth: {
        apiKey: {
          name: "Ollama local",
          resolve: async () => ({
            auth: { apiKey: NEXO_OLLAMA_COMPAT_API_KEY },
            source: "Nexo local Ollama compatibility token"
          })
        }
      },
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
        signal: boundedSignal(signal, 3_000)
      });
      if (!response.ok) return false;
      const body = await response.json() as { capabilities?: string[] };
      return body.capabilities?.includes("vision") ?? false;
    } catch {
      return false;
    }
  }
}

function hasExpectedToolCall(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return false;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    for (const call of toolCalls) {
      if (!call || typeof call !== "object") continue;
      const fn = (call as { function?: unknown }).function;
      if (!fn || typeof fn !== "object") continue;
      const name = (fn as { name?: unknown }).name;
      if (name !== PREFLIGHT_TOOL_NAME) continue;
      const args = parseToolArguments((fn as { arguments?: unknown }).arguments);
      if (args?.url === PREFLIGHT_URL) return true;
    }
  }
  return false;
}

function parseToolArguments(value: unknown): { url?: unknown } | undefined {
  if (value && typeof value === "object") return value as { url?: unknown };
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as { url?: unknown } : undefined;
  } catch {
    return undefined;
  }
}

function boundedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function classifyFetchError(error: unknown, fallback: string) {
  const value = error as Error & { name?: string };
  if (value?.name === "TimeoutError") return new BrowserAgentPreflightError("BROWSER_OLLAMA_TIMEOUT", `${fallback} Tempo limite excedido.`, { cause:error });
  if (value?.name === "AbortError") return new BrowserAgentPreflightError("BROWSER_OLLAMA_TIMEOUT", `${fallback} A operação foi interrompida.`, { cause:error });
  return new BrowserAgentPreflightError("BROWSER_OLLAMA_UNAVAILABLE", fallback, { cause:error });
}
