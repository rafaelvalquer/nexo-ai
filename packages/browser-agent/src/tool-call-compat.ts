export type BrowserToolCallSource = "structured" | "qwen_markup";

export type NormalizedBrowserToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  source: BrowserToolCallSource;
};

export type SanitizedToolCallDiagnostic = {
  assistantContentLength: number;
  thinkingLength: number;
  structuredToolCallCount: number;
  fallbackToolCallCount: number;
  containsToolCallMarkup: boolean;
  invalidToolCallMarkupCount: number;
  toolNames: string[];
};

export type OllamaToolCallInspection = {
  calls: NormalizedBrowserToolCall[];
  diagnostic: SanitizedToolCallDiagnostic;
  sanitizedContent: string;
};

/**
 * Normalizes Ollama structured tool_calls and the explicit <tool_call> JSON
 * markup emitted by some Qwen chat templates. Arbitrary JSON outside the tag is
 * deliberately ignored. Raw text, reasoning and arguments are never included in
 * the diagnostic object.
 */
export function inspectOllamaToolCalls(
  message: unknown,
  allowedToolNames?: ReadonlySet<string>
): OllamaToolCallInspection {
  const value = message && typeof message === "object"
    ? message as { content?: unknown; thinking?: unknown; tool_calls?: unknown }
    : {};
  const content = typeof value.content === "string" ? value.content : "";
  const thinking = typeof value.thinking === "string" ? value.thinking : "";
  const calls: NormalizedBrowserToolCall[] = [];
  const toolNames = new Set<string>();
  let structuredToolCallCount = 0;
  let fallbackToolCallCount = 0;
  let invalidToolCallMarkupCount = 0;

  if (Array.isArray(value.tool_calls)) {
    for (const item of value.tool_calls) {
      const parsed = parseToolCallCandidate(item);
      if (!parsed) continue;
      structuredToolCallCount += 1;
      toolNames.add(parsed.name);
      if (!isAllowed(parsed.name, allowedToolNames)) continue;
      calls.push({ ...parsed, source:"structured" });
    }
  }

  const tagPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  for (const match of content.matchAll(tagPattern)) {
    const payload = match[1]?.trim();
    if (!payload) {
      invalidToolCallMarkupCount += 1;
      continue;
    }
    try {
      const parsedJson = JSON.parse(payload) as unknown;
      const parsed = parseToolCallCandidate(parsedJson);
      if (!parsed) {
        invalidToolCallMarkupCount += 1;
        continue;
      }
      toolNames.add(parsed.name);
      if (!isAllowed(parsed.name, allowedToolNames)) {
        invalidToolCallMarkupCount += 1;
        continue;
      }
      fallbackToolCallCount += 1;
      calls.push({ ...parsed, source:"qwen_markup" });
    } catch {
      invalidToolCallMarkupCount += 1;
    }
  }

  const deduped = dedupeCalls(calls);
  return {
    calls:deduped,
    sanitizedContent:content.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/gi, "").trim(),
    diagnostic:{
      assistantContentLength:content.length,
      thinkingLength:thinking.length,
      structuredToolCallCount,
      fallbackToolCallCount,
      containsToolCallMarkup:/<tool_call>/i.test(content),
      invalidToolCallMarkupCount,
      toolNames:[...toolNames].sort()
    }
  };
}

export function formatSanitizedToolCallDiagnostic(diagnostic: SanitizedToolCallDiagnostic) {
  return [
    `structured=${diagnostic.structuredToolCallCount}`,
    `fallback=${diagnostic.fallbackToolCallCount}`,
    `contentLength=${diagnostic.assistantContentLength}`,
    `thinkingLength=${diagnostic.thinkingLength}`,
    `markup=${diagnostic.containsToolCallMarkup ? "sim" : "não"}`,
    `invalidMarkup=${diagnostic.invalidToolCallMarkupCount}`,
    `tools=${diagnostic.toolNames.length ? diagnostic.toolNames.join(",") : "nenhuma"}`
  ].join("; ");
}

function parseToolCallCandidate(value: unknown): { name:string; arguments:Record<string,unknown> } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const direct = value as { name?:unknown; arguments?:unknown; function?:unknown };
  const fn = direct.function && typeof direct.function === "object"
    ? direct.function as { name?:unknown; arguments?:unknown }
    : direct;
  if (typeof fn.name !== "string" || !fn.name.trim()) return undefined;
  const args = normalizeArguments(fn.arguments);
  if (!args) return undefined;
  return { name:fn.name.trim(), arguments:args };
}

function normalizeArguments(value: unknown): Record<string,unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string,unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string,unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function isAllowed(name:string, allowedToolNames?:ReadonlySet<string>) {
  return !allowedToolNames || allowedToolNames.has(name);
}

function dedupeCalls(calls:NormalizedBrowserToolCall[]) {
  const seen = new Set<string>();
  const result:NormalizedBrowserToolCall[] = [];
  for (const call of calls) {
    const key = `${call.name}:${JSON.stringify(call.arguments)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(call);
  }
  return result;
}
