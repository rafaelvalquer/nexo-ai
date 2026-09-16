import os from "node:os";
import path from "node:path";

export type SystemLocation = "downloads" | "documents" | "desktop" | "home" | "pictures" | "videos" | "music";
export type LocationSource = "system" | "settings" | "alias";

export interface ResolvedLocation {
  id: SystemLocation | string;
  label: string;
  path: string;
  source: LocationSource;
}

export interface LocationAlias {
  id: string;
  aliases: string[];
  path: string;
  enabled: boolean;
}

export type SystemLocationPaths = Partial<Record<SystemLocation, string>>;

const DEFINITIONS: Record<SystemLocation, { label: string; directory?: string; aliases: string[] }> = {
  downloads: { label: "Downloads", directory: "Downloads", aliases: ["downloads", "download", "meus downloads", "pasta downloads", "pasta download", "baixados", "baixado"] },
  documents: { label: "Documentos", directory: "Documents", aliases: ["documents", "document", "documentos", "documento", "meus documentos"] },
  desktop: { label: "Área de Trabalho", directory: "Desktop", aliases: ["desktop", "área de trabalho", "area de trabalho"] },
  home: { label: "Pasta pessoal", aliases: ["home", "pasta pessoal", "meu usuário", "meu usuario"] },
  pictures: { label: "Imagens", directory: "Pictures", aliases: ["pictures", "imagens", "fotos"] },
  videos: { label: "Vídeos", directory: "Videos", aliases: ["videos", "vídeos"] },
  music: { label: "Músicas", directory: "Music", aliases: ["music", "música", "musica", "músicas", "musicas"] },
};

const ENV_PATHS: Record<SystemLocation, string> = {
  downloads: "NEXO_SYSTEM_DOWNLOADS",
  documents: "NEXO_SYSTEM_DOCUMENTS",
  desktop: "NEXO_SYSTEM_DESKTOP",
  home: "NEXO_SYSTEM_HOME",
  pictures: "NEXO_SYSTEM_PICTURES",
  videos: "NEXO_SYSTEM_VIDEOS",
  music: "NEXO_SYSTEM_MUSIC",
};

export class LocationRegistry {
  private readonly locations = new Map<string, ResolvedLocation>();
  private readonly aliasIndex = new Map<string, { alias: string; location: ResolvedLocation }>();

  constructor(systemPaths: SystemLocationPaths = {}, aliases: LocationAlias[] = [], authorizedRoots: string[] = []) {
    const configuredHome = systemPaths.home ?? envPath("home");
    const home = canonical(configuredHome ?? os.homedir());
    for (const [id, definition] of Object.entries(DEFINITIONS) as Array<[SystemLocation, (typeof DEFINITIONS)[SystemLocation]]>) {
      const configured = systemPaths[id] ?? envPath(id);
      const resolvedPath = canonical(configured ?? (id === "home" ? home : path.join(home, definition.directory!)));
      const location: ResolvedLocation = { id, label: definition.label, path: resolvedPath, source: "system" };
      this.locations.set(id, location);
      for (const alias of [id, ...definition.aliases]) this.registerAlias(alias, location);
    }

    // Explicit aliases are authoritative conveniences, but never grant filesystem access.
    // Access is still decided later by PermissionEngine/PathPolicy against allowedRoots.
    for (const entry of aliases.filter(item => item.enabled)) {
      const location: ResolvedLocation = { id: entry.id, label: entry.id, path: canonical(entry.path), source: "alias" };
      this.locations.set(entry.id, location);
      for (const alias of [entry.id, ...entry.aliases]) this.registerAlias(alias, location, true);
    }

    this.registerAuthorizedRoots(authorizedRoots);
  }

  resolve(id: SystemLocation | string): ResolvedLocation | undefined {
    return this.locations.get(id) ?? this.resolveAlias(id);
  }

  resolveAlias(value: string): ResolvedLocation | undefined {
    return this.aliasIndex.get(normalizeLocationText(value))?.location;
  }

  getKnownLocations(): ResolvedLocation[] {
    return [...this.locations.values()].map(item => ({ ...item }));
  }

  getAliases(): Array<{ alias: string; normalized: string; location: ResolvedLocation }> {
    return [...this.aliasIndex.entries()]
      .map(([normalized, value]) => ({ normalized, alias: value.alias, location: { ...value.location } }))
      .sort((left, right) => right.normalized.length - left.normalized.length);
  }

  private registerAuthorizedRoots(roots: string[]) {
    const seen = new Set<string>();
    const canonicalRoots = roots.map(root => canonical(root)).filter(root => {
      const key = rootIdentity(root);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const candidates = canonicalRoots.map((root, index) => {
      const label = rootLabel(root);
      return { root, index, label, normalizedLabel: normalizeLocationText(label), canAlias: !isFilesystemRoot(root) };
    });
    const labelCount = new Map<string, number>();
    for (const item of candidates.filter(item => item.canAlias)) labelCount.set(item.normalizedLabel, (labelCount.get(item.normalizedLabel) ?? 0) + 1);

    for (const item of candidates) {
      const id = `authorized-root:${item.index}`;
      const location: ResolvedLocation = { id, label: item.label, path: item.root, source: "settings" };
      this.locations.set(id, location);

      // Absolute paths always resolve without aliases. A basename alias is added only
      // when it is unambiguous and does not shadow a built-in/explicit alias. Drive/
      // filesystem roots intentionally have no natural-language basename alias.
      if (!item.canAlias || !item.normalizedLabel || labelCount.get(item.normalizedLabel) !== 1 || this.aliasIndex.has(item.normalizedLabel)) continue;
      this.registerAlias(item.label, location);
      this.registerAlias(`pasta ${item.label}`, location);
    }
  }

  private registerAlias(alias: string, location: ResolvedLocation, overwrite = false) {
    const normalized = normalizeLocationText(alias);
    if (!normalized || (!overwrite && this.aliasIndex.has(normalized))) return;
    this.aliasIndex.set(normalized, { alias, location });
  }
}

export function normalizeLocationText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function envPath(id: SystemLocation) {
  const value = process.env[ENV_PATHS[id]]?.trim();
  return value || undefined;
}

function canonical(value: string) {
  if (path.win32.isAbsolute(value)) return path.win32.normalize(value);
  return path.resolve(value);
}

function rootLabel(value: string) {
  const windows = path.win32.isAbsolute(value);
  const normalized = windows ? path.win32.normalize(value) : path.normalize(value);
  const parsed = windows ? path.win32.parse(normalized) : path.parse(normalized);
  const base = windows ? path.win32.basename(normalized) : path.basename(normalized);
  return base || parsed.root || normalized;
}

function rootIdentity(value: string) {
  const normalized = canonical(value);
  return path.win32.isAbsolute(normalized) || process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isFilesystemRoot(value: string) {
  const parsed = path.win32.isAbsolute(value) ? path.win32.parse(path.win32.normalize(value)) : path.parse(path.normalize(value));
  return parsed.root === value || parsed.root === (path.win32.isAbsolute(value) ? path.win32.normalize(value) : path.normalize(value));
}
