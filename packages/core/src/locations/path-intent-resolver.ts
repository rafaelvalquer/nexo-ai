import path from "node:path";
import { LocationRegistry, normalizeLocationText } from "./location-registry.js";

export interface PathIntentResolution {
  original: string;
  location?: { id: string; confidence: number };
  relativePath?: string;
  resolvedPath?: string;
  status: "resolved" | "needs_confirmation" | "unresolved";
  candidates?: Array<{ locationId: string; confidence: number }>;
}

export class PathIntentResolver {
  constructor(private readonly locations: LocationRegistry = new LocationRegistry()) {}

  resolve(value: string): PathIntentResolution {
    const original = clean(value);
    if (!original) return { original: value, status: "unresolved" };

    if (isAbsolutePortable(original)) {
      return { original: value, resolvedPath: normalizeAbsolute(original), status: "resolved" };
    }

    const exact = this.exactPrefix(original);
    if (exact) return this.buildResolved(value, exact.location.id, 1, exact.location.path, exact.remainder);

    const head = original.split(/[\\/]/, 1)[0]?.trim() ?? original;
    const scored = this.locations.getAliases()
      .map(candidate => ({
        locationId: candidate.location.id,
        path: candidate.location.path,
        confidence: fuzzyConfidence(normalizeLocationText(head), candidate.normalized),
      }))
      .filter(candidate => candidate.confidence >= 0.75)
      .sort((left, right) => right.confidence - left.confidence)
      .filter((candidate, index, all) => all.findIndex(item => item.locationId === candidate.locationId) === index);

    const best = scored[0];
    if (!best) return { original: value, status: "unresolved" };
    const remainder = original.slice(head.length).replace(/^[\\/\s]+/, "");
    if (best.confidence >= 0.92) return this.buildResolved(value, best.locationId, best.confidence, best.path, remainder);

    return {
      original: value,
      location: { id: best.locationId, confidence: best.confidence },
      relativePath: safeRelative(remainder),
      status: "needs_confirmation",
      candidates: scored.slice(0, 3).map(candidate => ({ locationId: candidate.locationId, confidence: candidate.confidence })),
    };
  }

  private exactPrefix(value: string) {
    const normalized = normalizeLocationText(value);
    for (const candidate of this.locations.getAliases()) {
      if (normalized !== candidate.normalized && !normalized.startsWith(`${candidate.normalized}\\`) && !normalized.startsWith(`${candidate.normalized}/`)) continue;
      const remainder = value.slice(candidate.alias.length).replace(/^[\\/\s]+/, "");
      return { location: candidate.location, remainder };
    }
    return undefined;
  }

  private buildResolved(original: string, locationId: string, confidence: number, basePath: string, remainder: string): PathIntentResolution {
    const relativePath = safeRelative(remainder);
    if (remainder && relativePath === undefined) return { original, location: { id: locationId, confidence }, status: "unresolved" };
    const resolvedPath = relativePath ? joinPortable(basePath, relativePath) : basePath;
    return { original, location: { id: locationId, confidence }, relativePath, resolvedPath, status: "resolved" };
  }
}

export function damerauLevenshtein(left: string, right: string) {
  if (left === right) return 0;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let row = 0; row < rows; row++) matrix[row][0] = row;
  for (let col = 0; col < cols; col++) matrix[0][col] = col;
  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
      if (row > 1 && col > 1 && left[row - 1] === right[col - 2] && left[row - 2] === right[col - 1]) {
        matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + cost);
      }
    }
  }
  return matrix[left.length][right.length];
}

function fuzzyConfidence(left: string, right: string) {
  if (!left || !right) return 0;
  const distance = damerauLevenshtein(left, right);
  return Math.max(0, 1 - distance / (Math.max(left.length, right.length) * 2));
}

function safeRelative(value: string) {
  if (!value) return undefined;
  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (!segments.length || segments.some(segment => segment === ".." || segment === ".")) return undefined;
  return segments.join(path.sep);
}

function joinPortable(base: string, relative: string) {
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  return path.win32.isAbsolute(base) ? path.win32.join(base, ...segments) : path.join(base, ...segments);
}

function isAbsolutePortable(value: string) { return path.isAbsolute(value) || path.win32.isAbsolute(value); }
function normalizeAbsolute(value: string) { return path.win32.isAbsolute(value) ? path.win32.normalize(value) : path.resolve(value); }
function clean(value: string) { return value.trim().replace(/^['"]|['"]$/g, "").replace(/[.!?]+$/g, "").trim(); }
