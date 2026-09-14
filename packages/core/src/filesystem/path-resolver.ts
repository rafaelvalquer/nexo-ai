import os from "node:os";
import path from "node:path";
import { resolveKnownFolderFromText } from "./known-folders.js";

export type UserPathInput = {
  path?: unknown;
  folder?: unknown;
  file?: unknown;
};

export function resolveUserPath(input: UserPathInput): string | undefined {
  const explicit = stringValue(input.path);
  if (explicit) {
    const resolvedExplicit = resolveExplicit(explicit);
    if (resolvedExplicit) return resolvedExplicit;
  }

  const folder = stringValue(input.folder);
  const file = stringValue(input.file);
  const base = folder ? resolveKnownFolder(folder) : undefined;
  if (!base) return file && path.isAbsolute(file) ? path.normalize(file) : undefined;
  if (!file) return base;
  const relative = normalizeSafeRelative(file);
  return relative ? path.join(base, relative) : undefined;
}

export function resolveKnownFolder(value: string): string | undefined {
  const match = resolveKnownFolderFromText(value);
  return match && match.confidence >= 0.95 ? match.path : undefined;
}

function resolveExplicit(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return path.join(os.homedir(), trimmed.slice(2));
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);

  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return undefined;
  const base = resolveKnownFolder(parts[0]);
  if (!base) return undefined;
  if (parts.length === 1) return base;
  const relative = normalizeSafeRelative(parts.slice(1).join(path.sep));
  return relative ? path.join(base, relative) : undefined;
}

function normalizeSafeRelative(value: string): string | undefined {
  if (!value.trim() || path.isAbsolute(value)) return undefined;
  const normalized = path.normalize(value.trim());
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return undefined;
  return normalized;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
