const TOOL_NAME = "nexo_browser_preflight";
const TARGET_URL = "https://example.com";
const LOCAL_COMPAT_TOKEN = "nexo-local-ollama";

export async function runBrowserToolCallingDiagnostic({
  fetchImpl = fetch,
  ollamaUrl = "http://127.0.0.1:11434",
  model = "qwen3:4b",
  timeoutMs = 20_000,
  now = () => Date.now()
} = {}) {
  const base = String(ollamaUrl).replace(/\/$/, "");
  const modelInfo = await requestJson(fetchImpl, `${base}/api/show`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(timeoutMs)
  }, now);

  if (!modelInfo.ok) {
    return {
      ok: false,
      timestamp: new Date().toISOString(),
      model,
      ollamaUrl: base,
      stage: "model_info",
      error: modelInfo.error,
      httpStatus: modelInfo.httpStatus,
      latencyMs: modelInfo.latencyMs
    };
  }

  const capabilities = Array.isArray(modelInfo.body?.capabilities)
    ? modelInfo.body.capabilities.filter(item => typeof item === "string")
    : [];

  const messages = [
    {
      role: "system",
      content: "You are a capability probe. You must call the provided function. Do not answer with natural language."
    },
    {
      role: "user",
      content: `Call ${TOOL_NAME} with url exactly ${TARGET_URL}.`
    }
  ];
  const tools = [{
    type: "function",
    function: {
      name: TOOL_NAME,
      description: "Capability probe for Browser Agent tool calling.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false
      }
    }
  }];

  const openaiCompatible = await probe(fetchImpl, {
    endpoint: `${base}/v1/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${LOCAL_COMPAT_TOKEN}`
    },
    body: {
      model,
      messages,
      tools,
      stream: false,
      temperature: 0,
      max_tokens: 256
    },
    timeoutMs,
    now,
    responseShape: "openai"
  });

  const nativeApi = await probe(fetchImpl, {
    endpoint: `${base}/api/chat`,
    headers: { "content-type": "application/json" },
    body: {
      model,
      messages,
      tools,
      stream: false,
      think: false,
      options: { temperature: 0 }
    },
    timeoutMs,
    now,
    responseShape: "native"
  });

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    model,
    ollamaUrl: base,
    capabilities,
    probe: {
      toolName: TOOL_NAME,
      targetUrl: TARGET_URL
    },
    openaiCompatible,
    nativeApi,
    comparison: classify(openaiCompatible.toolCallDetected, nativeApi.toolCallDetected)
  };
}

async function probe(fetchImpl, { endpoint, headers, body, timeoutMs, now, responseShape }) {
  const startedAt = now();
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    return {
      endpoint,
      ok: false,
      httpStatus: null,
      latencyMs: now() - startedAt,
      toolCallDetected: false,
      assistantContentPresent: false,
      toolCalls: [],
      error: safeError(error)
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      endpoint,
      ok: false,
      httpStatus: response.status,
      latencyMs: now() - startedAt,
      toolCallDetected: false,
      assistantContentPresent: false,
      toolCalls: [],
      error: `Resposta JSON inválida: ${safeError(error)}`
    };
  }

  const summary = responseShape === "native"
    ? summarizeNative(payload)
    : summarizeOpenAI(payload);

  return {
    endpoint,
    ok: response.ok,
    httpStatus: response.status,
    latencyMs: now() - startedAt,
    ...summary,
    error: response.ok ? null : `HTTP ${response.status}`
  };
}

async function requestJson(fetchImpl, endpoint, init, now) {
  const startedAt = now();
  try {
    const response = await fetchImpl(endpoint, init);
    let body;
    try {
      body = await response.json();
    } catch (error) {
      return {
        ok: false,
        httpStatus: response.status,
        latencyMs: now() - startedAt,
        error: `Resposta JSON inválida: ${safeError(error)}`
      };
    }
    return {
      ok: response.ok,
      httpStatus: response.status,
      latencyMs: now() - startedAt,
      body,
      error: response.ok ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      latencyMs: now() - startedAt,
      error: safeError(error)
    };
  }
}

function summarizeOpenAI(payload) {
  const messages = Array.isArray(payload?.choices)
    ? payload.choices.map(choice => choice?.message).filter(Boolean)
    : [];
  return summarizeMessages(messages);
}

function summarizeNative(payload) {
  return summarizeMessages(payload?.message ? [payload.message] : []);
}

function summarizeMessages(messages) {
  const toolCalls = [];
  let assistantContentPresent = false;

  for (const message of messages) {
    if (typeof message?.content === "string" && message.content.trim().length > 0) {
      assistantContentPresent = true;
    }
    if (!Array.isArray(message?.tool_calls)) continue;
    for (const call of message.tool_calls) {
      const fn = call?.function;
      if (!fn || typeof fn !== "object") continue;
      const args = normalizeArguments(fn.arguments);
      toolCalls.push({
        name: typeof fn.name === "string" ? fn.name : null,
        arguments: args
      });
    }
  }

  const toolCallDetected = toolCalls.some(call =>
    call.name === TOOL_NAME && call.arguments?.url === TARGET_URL
  );

  return {
    toolCallDetected,
    assistantContentPresent,
    toolCalls
  };
}

function normalizeArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function classify(openAi, nativeApi) {
  if (openAi && nativeApi) return "both_support_tool_calling";
  if (!openAi && nativeApi) return "native_api_only";
  if (openAi && !nativeApi) return "openai_compatible_only";
  return "neither_endpoint_supports_tool_calling";
}

function safeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
