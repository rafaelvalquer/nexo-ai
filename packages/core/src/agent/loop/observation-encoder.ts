import type { ToolResult } from "@nexo/shared";
import type { AgentObservation, AgentReference } from "./types.js";
const refKeys: Record<string, AgentReference["kind"]> = { id: "id", path: "path", url: "url", messageId: "message_id", eventId: "event_id", threadId: "thread_id", fileId: "file_id", processId: "process_id" };
const secretKey = /^(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)$/i;
const unsafeObjectKey = new Set(["__proto__", "prototype", "constructor"]);

export function encodeObservation(toolCallId: string, toolName: string, result: ToolResult, trust: AgentObservation["trust"] = "UNTRUSTED_CONTENT", maxBytes = 64_000, maxReferences = 100): AgentObservation {
  const sanitized = sanitize(result.data);
  const references = collectReferences(sanitized, [], maxReferences);
  const serialized = safeJson(sanitized);
  const originalBytes = Buffer.byteLength(serialized);
  const truncated = originalBytes > maxBytes;
  const data = truncated ? { references, notice: "Conteúdo truncado e normalizado; use somente as referências preservadas." } : sanitized;
  const progress=extractProgress(sanitized);
  return { toolCallId, toolName, ok: result.ok, summary: normalizeText(result.summary, 8_000), ...(data === undefined ? {} : { data }), ...(references.length ? { references } : {}), trust, truncated, originalBytes, encodedBytes: Buffer.byteLength(safeJson(data)),...(progress?{progress}:{}) };
}

function sanitize(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 20) return "[TRUNCATED_DEPTH]";
  if (typeof value === "string") return normalizeText(value, 200_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 1_000).map(item => sanitize(item, seen, depth + 1));
  const output: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 1_000)) {
    if (unsafeObjectKey.has(key)) continue;
    output[key] = secretKey.test(key) ? "[REDACTED]" : sanitize(item, seen, depth + 1);
  }
  return output;
}
function normalizeText(value: string, max: number) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").slice(0, max); }
function safeJson(value: unknown) { try { return JSON.stringify(value) ?? "null"; } catch { return '"[UNSERIALIZABLE]"'; } }
function collectReferences(value: unknown, found: AgentReference[] = [], max = 100): AgentReference[] { if (!value || typeof value !== "object" || found.length >= max) return found; if (Array.isArray(value)) { value.forEach(item => collectReferences(item, found, max)); return found; } for (const [key, item] of Object.entries(value as Record<string, unknown>)) { const kind = refKeys[key]; if (kind && (typeof item === "string" || typeof item === "number")) found.push({ kind, value: String(item), label: key }); else collectReferences(item, found, max); if (found.length >= max) break; } return found; }
function extractProgress(value:unknown){if(!value||typeof value!=="object"||Array.isArray(value))return undefined;const object=value as Record<string,unknown>;for(const key of ["progress","status","state","percent","completed"]){const item=object[key];if(typeof item==="string"||typeof item==="number")return{key,value:item};}return undefined;}
