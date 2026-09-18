import fs from "node:fs/promises";
import path from "node:path";
import { normalizeFilename } from "./filename-normalizer.js";

export type PhysicalFileMatch = { name: string; path: string; root: string; size: number; modifiedAt: string };
export type PhysicalSearchOptions = { roots: string[]; query: string; mode?: "exact" | "case_insensitive" | "full_name" | "stem" | "contains" | "extension"; maxDepth?: number; maxEntries?: number; maxResults?: number; concurrency?: number; maxDurationMs?: number; onProgress?: (event: { scannedEntries: number; scannedDirectories: number; matches: number; currentRoot: string }) => void };
export type PhysicalSearchResult = { matches: PhysicalFileMatch[]; scannedEntries: number; scannedDirectories: number; elapsedMs: number; truncated: boolean; reason?: "max_entries" | "time_budget" | "max_results" };

export class PhysicalFileSearch {
  async find(options: PhysicalSearchOptions, signal?: AbortSignal, authorize: (candidate: string) => void = () => undefined): Promise<PhysicalSearchResult> {
    const roots = [...new Set(options.roots.map(root => path.resolve(root)))];
    const maxDepth = options.maxDepth ?? 6, maxEntries = options.maxEntries ?? 20_000, maxResults = options.maxResults ?? 20;
    const concurrency = Math.max(1, Math.min(32, options.concurrency ?? 12)), deadline = Date.now() + (options.maxDurationMs ?? 15_000), started = Date.now();
    const queue = roots.map(root => ({ directory: root, root, depth: 0 }));
    const matches: PhysicalFileMatch[] = [];
    let scannedEntries = 0, scannedDirectories = 0, stop = false, reason: PhysicalSearchResult["reason"];
    const target = normalizeFilename(options.query), exactTarget=options.query.normalize("NFKC");
    const report = (root: string) => options.onProgress?.({ scannedEntries, scannedDirectories, matches: matches.length, currentRoot: root });
    const worker = async () => {
      while (!stop) {
        signal?.throwIfAborted();
        if (Date.now() >= deadline) { stop = true; reason = "time_budget"; break; }
        if (scannedEntries >= maxEntries) { stop = true; reason = "max_entries"; break; }
        const item = queue.shift();
        if (!item) break;
        scannedDirectories++;
        let entries;
        try { signal?.throwIfAborted(); entries = await fs.readdir(item.directory, { withFileTypes: true }); }
        catch (error) { if (signal?.aborted) throw error; continue; }
        signal?.throwIfAborted();
        entries.sort((a,b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          signal?.throwIfAborted();
          if (scannedEntries >= maxEntries) { stop = true; reason = "max_entries"; break; }
          if (Date.now() >= deadline) { stop = true; reason = "time_budget"; break; }
          scannedEntries++;
          const candidate = path.join(item.directory, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) { if (item.depth < maxDepth) queue.push({ directory: candidate, root: item.root, depth: item.depth + 1 }); continue; }
          if (!entry.isFile()) continue;
          const normalized = normalizeFilename(entry.name);
          const matched = options.mode === "contains" ? normalized.includes(target) : options.mode === "extension" ? normalized.endsWith(target.startsWith(".") ? target : `.${target}`) : options.mode === "stem" ? normalizeFilename(path.parse(entry.name).name) === target : options.mode === "exact" ? entry.name.normalize("NFKC") === exactTarget : options.mode === "full_name" ? normalized === target : normalized === target;
          if (!matched) continue;
          try { authorize(candidate); const stat = await fs.stat(candidate); if (!stat.isFile()) continue; matches.push({ name: entry.name, path: candidate, root: item.root, size: stat.size, modifiedAt: stat.mtime.toISOString() }); }
          catch { continue; }
          if (matches.length >= maxResults) { stop = true; reason = "max_results"; break; }
        }
        report(item.root);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    matches.sort((a,b) => roots.indexOf(a.root) - roots.indexOf(b.root) || a.path.localeCompare(b.path));
    return { matches, scannedEntries, scannedDirectories, elapsedMs: Date.now() - started, truncated: Boolean(reason), ...(reason ? { reason } : {}) };
  }
}
