import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { BrowserAgentErrorCode } from "@nexo/shared/browser-agent";
import type { BrowserAgentModelSource } from "./model-selection.js";
import {
  formatSanitizedToolCallDiagnostic,
  inspectOllamaToolCalls,
  type BrowserToolCallSource,
  type SanitizedToolCallDiagnostic
} from "./tool-call-compat.js";

/**
 * The model catalog still needs a provider entry, but Browser Agent requests are
 * overridden with the native Ollama streamFn. This token is only a local catalog
 * compatibility value and is never a real secret.
 */
export const NEXO_OLLAMA_COMPAT_API_KEY = "nexo-local-ollama";
const PREFLIGHT_TOOL_NAME = "nexo_browser_preflight";
const PREFLIGHT_URL = "https://example.com";

export function buildBrowserToolCallingProbeRequest(model:string,think:"omitted"|boolean="omitted") {
  const request:{model:string;messages:Array<{role:string;content:string}>;tools:unknown[];stream:false;options:{temperature:number};think?:boolean}={
    model,
    messages:[{role:"system",content:"You are a capability probe. You must call the provided function. Do not answer with natural language."},{role:"user",content:`Call ${PREFLIGHT_TOOL_NAME} with url exactly ${PREFLIGHT_URL}.`}],
    tools:[{type:"function",function:{name:PREFLIGHT_TOOL_NAME,description:"Capability probe for Browser Agent tool calling.",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"],additionalProperties:false}}}],
    stream:false,
    options:{temperature:0}
  };
  if(think!=="omitted")request.think=think;
  return request;
}

export type OllamaPreflightResult = {
  available: true;
  modelExists: true;
  toolCallingValidated: true;
  capabilities: string[];
  latencyMs: number;
  compatibilityLatencyMs: number;
  toolCallSource: BrowserToolCallSource;
  diagnostic: SanitizedToolCallDiagnostic;
};

export class BrowserAgentPreflightError extends Error {
  constructor(public readonly code: BrowserAgentErrorCode, message: string, options?: ErrorOptions, public readonly metadata?:{model:string;source:BrowserAgentModelSource;httpStatus?:number}) {
    super(message, options);
    this.name = "BrowserAgentPreflightError";
  }
}

/** Adapts the Nexo Ollama endpoint to Pi's model catalog without any cloud dependency. */
export class NexoBrowserModelAdapter {
  constructor(private readonly ollamaUrl: string, private readonly modelId: string, private readonly modelSource:BrowserAgentModelSource="global_setting") {}

  async preflight(signal?: AbortSignal): Promise<OllamaPreflightResult> {
    const base = this.ollamaUrl.replace(/\/$/, "");
    await this.assertModelInstalled(base,signal);
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
      throw classifyFetchError(error, "Não foi possível conectar ao Ollama local.",this.modelId,this.modelSource);
    }

    if (!response.ok) throw await this.classifyModelResponse(response,"/api/show");

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
      compatibilityResponse = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBrowserToolCallingProbeRequest(this.modelId)),
        signal: boundedSignal(signal, 20_000)
      });
    } catch (error) {
      throw classifyFetchError(error, "O Ollama não concluiu o preflight nativo de tool calling do Browser Agent.",this.modelId,this.modelSource);
    }

    if (!compatibilityResponse.ok) {
      if (compatibilityResponse.status === 404) throw this.error("BROWSER_MODEL_NOT_FOUND",`O modelo selecionado não foi encontrado durante o teste nativo de tool calling.`,compatibilityResponse.status);
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_INCOMPATIBLE",
        `O endpoint nativo /api/chat do Ollama respondeu com HTTP ${compatibilityResponse.status} durante o teste de tool calling.`
      );
    }

    let compatibility: unknown;
    try {
      compatibility = await compatibilityResponse.json();
    } catch (error) {
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_INVALID_RESPONSE",
        "O endpoint nativo /api/chat do Ollama retornou uma resposta inválida durante o preflight de tool calling.",
        { cause:error }
      );
    }

    const message = compatibility && typeof compatibility === "object"
      ? (compatibility as { message?:unknown }).message
      : undefined;
    const inspection = inspectOllamaToolCalls(message, new Set([PREFLIGHT_TOOL_NAME]));
    const expected = inspection.calls.find(call =>
      call.name === PREFLIGHT_TOOL_NAME && call.arguments.url === PREFLIGHT_URL
    );
    if (!expected) {
      throw new BrowserAgentPreflightError(
        "BROWSER_MODEL_TOOL_CALL_UNSUPPORTED",
        `O modelo ${this.modelId} respondeu ao endpoint nativo /api/chat, mas não produziu o tool call exigido pelo Browser Agent. Diagnóstico sanitizado: ${formatSanitizedToolCallDiagnostic(inspection.diagnostic)}.`
      );
    }

    return {
      available:true,
      modelExists:true,
      toolCallingValidated:true,
      capabilities,
      latencyMs,
      compatibilityLatencyMs:Date.now() - compatibilityStarted,
      toolCallSource:expected.source,
      diagnostic:inspection.diagnostic
    };
  }

  private async assertModelInstalled(base:string,signal?:AbortSignal) {
    let response:Response;
    try { response=await fetch(`${base}/api/tags`,{signal:boundedSignal(signal,10_000)}); }
    catch(error){ throw classifyFetchError(error,"Não foi possível consultar os modelos instalados no Ollama.",this.modelId,this.modelSource); }
    if(!response.ok)throw new BrowserAgentPreflightError("BROWSER_OLLAMA_UNAVAILABLE",`O endpoint /api/tags respondeu com HTTP ${response.status}.`,undefined,{model:this.modelId,source:this.modelSource,httpStatus:response.status});
    let body:{models?:Array<{name?:unknown;model?:unknown}>};
    try{body=await response.json() as typeof body;}catch(error){throw this.error("BROWSER_MODEL_INVALID_RESPONSE","O endpoint /api/tags retornou JSON inválido.",response.status,error);}
    const installed=new Set((Array.isArray(body.models)?body.models:[]).flatMap(item=>[item.name,item.model]).filter((item):item is string=>typeof item==="string"));
    if(!installed.has(this.modelId))throw this.error("BROWSER_MODEL_NOT_FOUND",`O modelo selecionado não está instalado no Ollama.`,undefined);
  }

  private async classifyModelResponse(response:Response,endpoint:string){
    const detail=await readOllamaError(response);
    if(response.status===404||/not found|does not exist|try pulling/i.test(detail))return this.error("BROWSER_MODEL_NOT_FOUND",`O modelo selecionado não foi encontrado por ${endpoint}. ${detail}`,response.status);
    if(response.status===400)return this.error("BROWSER_MODEL_CONFIG_INVALID",`Ollama rejeitou a configuração do modelo em ${endpoint}. ${detail}`,response.status);
    return this.error("BROWSER_OLLAMA_UNAVAILABLE",`O endpoint ${endpoint} respondeu com HTTP ${response.status}. ${detail}`,response.status);
  }

  private error(code:BrowserAgentErrorCode,message:string,httpStatus?:number,cause?:unknown){
    return new BrowserAgentPreflightError(code,`${message} Modelo: ${this.modelId}. Origem: ${this.modelSource}.`,cause===undefined?undefined:{cause},{model:this.modelId,source:this.modelSource,...(httpStatus===undefined?{}:{httpStatus})});
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

function boundedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function classifyFetchError(error: unknown, fallback: string, model="desconhecido", source:BrowserAgentModelSource="global_setting") {
  const value = error as Error & { name?: string };
  const metadata={model,source};
  if (value?.name === "TimeoutError") return new BrowserAgentPreflightError("BROWSER_OLLAMA_TIMEOUT", `${fallback} Tempo limite excedido. Modelo: ${model}. Origem: ${source}.`, { cause:error },metadata);
  if (value?.name === "AbortError") return new BrowserAgentPreflightError("BROWSER_OLLAMA_TIMEOUT", `${fallback} A operação foi interrompida. Modelo: ${model}. Origem: ${source}.`, { cause:error },metadata);
  return new BrowserAgentPreflightError("BROWSER_OLLAMA_UNAVAILABLE", `${fallback} Modelo: ${model}. Origem: ${source}.`, { cause:error },metadata);
}

async function readOllamaError(response:Response){
  try{const body=await response.json() as {error?:unknown;message?:unknown};return sanitizeError(typeof body.error==="string"?body.error:typeof body.message==="string"?body.message:"");}catch{return"Resposta sem detalhe estruturado.";}
}
function sanitizeError(value:string){const clean=value.replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,240);return clean||"Ollama não informou detalhes.";}
