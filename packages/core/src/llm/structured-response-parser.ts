export type StructuredRawKind = "json" | "markdown" | "text" | "empty";

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawKind: StructuredRawKind,
    public readonly causeDetail?: string
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export function structuredRawKind(raw: string): StructuredRawKind {
  const value = raw.trim();
  if (!value) return "empty";
  if (/^```/i.test(value)) return "markdown";
  if (value.startsWith("{") || value.startsWith("[")) return "json";
  return "text";
}

export function parseStructuredJson(raw: string): unknown {
  const value = raw.trim();
  const kind = structuredRawKind(raw);
  if (!value) throw new StructuredOutputError("O modelo retornou uma resposta estruturada vazia.", kind);

  const candidates = unique([
    value,
    stripFence(value),
    extractFirstBalancedJson(value)
  ].filter((item): item is string => Boolean(item?.trim())));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new StructuredOutputError(
    "Não foi possível extrair JSON válido da resposta do modelo.",
    kind,
    lastError instanceof Error ? lastError.message : String(lastError ?? "JSON inválido")
  );
}

function stripFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractFirstBalancedJson(value: string): string | undefined {
  const firstObject = value.indexOf("{");
  const firstArray = value.indexOf("[");
  let start = -1;
  let opener = "";
  let closer = "";
  if (firstObject >= 0 && (firstArray < 0 || firstObject < firstArray)) {
    start = firstObject; opener = "{"; closer = "}";
  } else if (firstArray >= 0) {
    start = firstArray; opener = "["; closer = "]";
  }
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === opener) depth++;
    if (char === closer) {
      depth--;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
