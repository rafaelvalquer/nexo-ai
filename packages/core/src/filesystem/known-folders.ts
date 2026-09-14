import os from "node:os";
import path from "node:path";

export type KnownFolderId = "downloads" | "documents" | "desktop";

export type KnownFolderMatch = {
  id: KnownFolderId;
  path: string;
  confidence: number;
  matchedAlias: string;
};

const DEFINITIONS: Record<KnownFolderId, { directory: string; aliases: string[] }> = {
  downloads: {
    directory: "Downloads",
    aliases: ["downloads", "download", "baixado", "baixados", "pasta download", "pasta downloads", "meus downloads"],
  },
  documents: {
    directory: "Documents",
    aliases: ["documents", "document", "documento", "documentos"],
  },
  desktop: {
    directory: "Desktop",
    aliases: ["desktop", "área de trabalho", "area de trabalho"],
  },
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizedAliases = Object.entries(DEFINITIONS).flatMap(([id, definition]) =>
  definition.aliases.map((alias) => ({ id: id as KnownFolderId, alias, normalized: normalize(alias) })),
).sort((a, b) => b.normalized.length - a.normalized.length);

function containsAlias(text: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

function levenshtein(a: string, b: string) {
  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  return matrix[b.length][a.length];
}

export function knownFolderPath(id: KnownFolderId) {
  return path.join(os.homedir(), DEFINITIONS[id].directory);
}

export function knownFolderAliases(id: KnownFolderId) {
  return [...DEFINITIONS[id].aliases];
}

export function resolveKnownFolderFromText(text: string): KnownFolderMatch | undefined {
  const normalized = normalize(text);
  if (!normalized) return undefined;

  for (const candidate of normalizedAliases) {
    if (containsAlias(normalized, candidate.normalized)) {
      return {
        id: candidate.id,
        path: knownFolderPath(candidate.id),
        confidence: 1,
        matchedAlias: candidate.alias,
      };
    }
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 5);
  const fuzzyTargets: Array<{ id: KnownFolderId; alias: string }> = [
    { id: "downloads", alias: "downloads" },
    { id: "downloads", alias: "download" },
    { id: "documents", alias: "documents" },
    { id: "documents", alias: "documentos" },
    { id: "desktop", alias: "desktop" },
  ];

  let best: KnownFolderMatch | undefined;
  for (const token of tokens) {
    for (const target of fuzzyTargets) {
      const distance = levenshtein(token, target.alias);
      const maxDistance = Math.max(token.length, target.alias.length) >= 8 ? 2 : 1;
      if (distance > maxDistance) continue;
      const confidence = distance === 1 ? 0.86 : 0.76;
      if (!best || confidence > best.confidence) {
        best = {
          id: target.id,
          path: knownFolderPath(target.id),
          confidence,
          matchedAlias: token,
        };
      }
    }
  }
  return best;
}

export function resolveKnownFolderId(value: string): KnownFolderId | undefined {
  const match = resolveKnownFolderFromText(value);
  return match && match.confidence >= 0.95 ? match.id : undefined;
}
