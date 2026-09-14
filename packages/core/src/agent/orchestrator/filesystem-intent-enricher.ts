import type { AgentIntent } from "./intent-schema.js";
import { resolveKnownFolderFromText } from "../../filesystem/known-folders.js";

const RECENT_FILES_PATTERN = /\b(?:quais\s+s[aã]o\s+os\s+)?(?:[uú]ltimos\s+arquivos|arquivos\s+(?:mais\s+)?recentes|arquivos\s+mais\s+novos)\b/i;
const LIST_FILES_PATTERN = /\b(?:liste|listar|lista|mostre|mostrar|veja|ver)\b[\s\S]*\b(?:arquivos?|itens?)\b|\b(?:arquivos?|itens?)\b[\s\S]*\b(?:liste|listar|lista|mostre|mostrar|veja|ver)\b/i;

export function isRecentFilesRequest(text: string) {
  return RECENT_FILES_PATTERN.test(text.normalize("NFC"));
}

export function isFilesystemListRequest(text: string) {
  return isRecentFilesRequest(text) || LIST_FILES_PATTERN.test(text.normalize("NFC"));
}

export function deterministicFilesystemIntent(text: string): AgentIntent | undefined {
  if (!isFilesystemListRequest(text)) return undefined;
  const match = resolveKnownFolderFromText(text);
  const explicitPath = extractExplicitFolderPath(text);
  const recent = isRecentFilesRequest(text);
  const entities: Record<string, unknown> = {};

  if (explicitPath) entities.path = explicitPath;
  else if (match && match.confidence >= 0.95) entities.folder = match.id;
  if (recent) Object.assign(entities, {
    kind: "file",
    sortBy: "modifiedAt",
    sortDirection: "desc",
    limit: 20,
  });

  const missingFolder = !entities.folder && !entities.path;
  return {
    schemaVersion: 1,
    status: missingFolder ? "needs_clarification" : "ready",
    domain: "filesystem",
    intent: "list",
    operation: "list_files",
    entities,
    referencesPreviousResult: false,
    requiresDataLookup: true,
    requiresConfirmation: false,
    confidence: explicitPath ? 1 : match?.confidence ?? 0.98,
    missing: missingFolder ? ["folder"] : undefined,
    question: missingFolder ? "Qual pasta você quer consultar?" : undefined,
    suggestedValues: missingFolder ? { folder: match?.id ?? "downloads" } : undefined,
  };
}

export function enrichFilesystemIntent(intent: AgentIntent, text: string): AgentIntent {
  if (intent.domain !== "filesystem") return intent;

  const entities = { ...intent.entities };
  const match = resolveKnownFolderFromText(text);
  const explicitPath = extractExplicitFolderPath(text);
  const recent = isRecentFilesRequest(text);
  const isList = intent.intent === "list" || intent.operation === "list_files" || isFilesystemListRequest(text);

  if (explicitPath) entities.path = explicitPath;
  else if (match && match.confidence >= 0.95) entities.folder = match.id;
  if (recent) Object.assign(entities, {
    kind: "file",
    sortBy: "modifiedAt",
    sortDirection: "desc",
    limit: 20,
  });

  if (!isList) return { ...intent, entities };

  const hasFolder = typeof entities.folder === "string" || typeof entities.path === "string";
  const missing = new Set(intent.missing ?? []);
  if (hasFolder) missing.delete("folder");
  else missing.add("folder");

  const needsClarification = missing.size > 0;
  return {
    ...intent,
    intent: "list",
    operation: "list_files",
    entities,
    status: needsClarification ? "needs_clarification" : "ready",
    missing: needsClarification ? [...missing] : undefined,
    question: needsClarification ? (intent.question || "Qual pasta você quer consultar?") : undefined,
    suggestedValues: needsClarification
      ? { ...(intent.suggestedValues ?? {}), folder: match?.id ?? intent.suggestedValues?.folder ?? "downloads" }
      : intent.suggestedValues,
    requiresDataLookup: true,
    requiresConfirmation: false,
    confidence: Math.max(intent.confidence, explicitPath ? 1 : match?.confidence ?? 0),
  };
}

function extractExplicitFolderPath(text: string) {
  const quoted = text.match(/\bpasta\s+["“']([^"”']+)["”']/i)?.[1]?.trim();
  if (!quoted) return undefined;
  if (/^[A-Za-z]:[\\/]/.test(quoted) || quoted.startsWith("/") || quoted.startsWith("\\\\")) return quoted;
  return undefined;
}
