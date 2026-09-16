import os from "node:os";
import path from "node:path";

export function defaultDataDir() {
  if(process.env.NEXO_DATA_DIR)return path.resolve(process.env.NEXO_DATA_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "NexoAI");
  }
  return path.join(os.homedir(), ".nexo-ai");
}

export function defaultAllowedRoots() {
  return normalizeAllowedRoots([
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Desktop")
  ]);
}

/** Canonicalizes the configured authorization boundary without requiring a root to be online right now. */
export function normalizeAllowedRoots(roots: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of roots) {
    const value = raw.trim();
    if (!value) continue;
    const canonical = path.win32.isAbsolute(value) ? path.win32.normalize(value) : path.resolve(value);
    const identity = path.win32.isAbsolute(canonical) || process.platform === "win32" ? canonical.toLowerCase() : canonical;
    if (seen.has(identity)) continue;
    seen.add(identity);
    normalized.push(canonical);
  }
  return normalized;
}
