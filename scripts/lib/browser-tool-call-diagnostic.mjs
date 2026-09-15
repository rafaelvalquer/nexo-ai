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
    return failedProbe(endpoint, null, now() - startedAt, safeError(error));
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return failedProbe(endpoint, response.status, now() - startedAt, `Resposta JSON inválida: ${safeError(error)}`);
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

function failedProbe(endpoint, httpStatus, latencyMs, error) {
  return {
    endpoint,
    ok:false,
    httpStatus,
    latencyMs,
    toolCallDetected:false,
    assistantContentPresent:false,
    toolCalls:[],
    diagnostic:emptyDiagnostic(),
    error
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
  return summarizeMessages(messages, false);
}

function summarizeNative(payload) {
  return summarizeMessages(payload?.message ? [payload.message] : [], true);
}

function summarizeMessages(messages, parseQwenMarkup) {
  const calls = [];
  const toolNames = new Set();
  let assistantContentPresent = false;
  let assistantContentLength = 0;
  let thinkingLength = 0;
  let structuredToolCallCount = 0;
  let fallbackToolCallCount = 0;
  let invalidToolCallMarkupCount = 0;
  let containsToolCallMarkup = false;

  for (const message of messages) {
    const content = typeof message?.content === "string" ? message.content : "";
    const thinking = typeof message?.thinking === "string" ? message.thinking : "";
    assistantContentLength += content.length;
    thinkingLength += thinking.length;
    if (content.trim().length > 0) assistantContentPresent = true;

    if (Array.isArray(message?.tool_calls)) {
      for (const call of message.tool_calls) {
        const parsed = normalizeCall(call, "structured");
        if (!parsed) continue;
        structuredToolCallCount += 1;
        toolNames.add(parsed.name);
        calls.push(parsed);
      }
    }

    if (parseQwenMarkup) {
      const pattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
      for (const match of content.matchAll(pattern)) {
        containsToolCallMarkup = true;
        try {
          const parsedJson = JSON.parse(match[1]?.trim() ?? "");
          const parsed = normalizeCall(parsedJson, "qwen_markup");
          if (!parsed) {
            invalidToolCallMarkupCount += 1;
            continue;
          }
          fallbackToolCallCount += 1;
          toolNames.add(parsed.name);
          calls.push(parsed);
        } catch {
          invalidToolCallMarkupCount += 1;
        }
      }
    }
  }

  const toolCallDetected = calls.some(call =>
    call.name === TOOL_NAME && call.arguments?.url === TARGET_URL
  );

  return {
    toolCallDetected,
    assistantContentPresent,
    toolCalls:calls.map(call => ({ name:call.name, source:call.source })),
    diagnostic:{
      assistantContentLength,
      thinkingLength,
      structuredToolCallCount,
      fallbackToolCallCount,
      containsToolCallMarkup,
      invalidToolCallMarkupCount,
      toolNames:[...toolNames].sort()
    }
  };
}

function normalizeCall(value, source) {
  if (!value || typeof value !== "object") return null;
  const direct = value;
  const fn = direct.function && typeof direct.function === "object" ? direct.function : direct;
  if (typeof fn.name !== "string" || !fn.name) return null;
  const args = normalizeArguments(fn.arguments);
  if (!args) return null;
  return { name:fn.name, arguments:args, source };
}

function normalizeArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function emptyDiagnostic() {
  return {
    assistantContentLength:0,
    thinkingLength:0,
    structuredToolCallCount:0,
    fallbackToolCallCount:0,
    containsToolCallMarkup:false,
    invalidToolCallMarkupCount:0,
    toolNames:[]
  };
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
