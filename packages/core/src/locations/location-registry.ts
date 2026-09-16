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

  constructor(systemPaths: SystemLocationPaths = {}, aliases: LocationAlias[] = []) {
    const configuredHome = systemPaths.home ?? envPath("home");
    const home = canonical(configuredHome ?? os.homedir());
    for (const [id, definition] of Object.entries(DEFINITIONS) as Array<[SystemLocation, (typeof DEFINITIONS)[SystemLocation]]>) {
      const configured = systemPaths[id] ?? envPath(id);
      const resolvedPath = canonical(configured ?? (id === "home" ? home : path.join(home, definition.directory!)));
      const location: ResolvedLocation = { id, label: definition.label, path: resolvedPath, source: "system" };
      this.locations.set(id, location);
      for (const alias of [id, ...definition.aliases]) this.aliasIndex.set(normalizeLocationText(alias), { alias, location });
    }

    for (const entry of aliases.filter(item => item.enabled)) {
      const location: ResolvedLocation = { id: entry.id, label: entry.id, path: canonical(entry.path), source: "alias" };
      this.locations.set(entry.id, location);
      for (const alias of [entry.id, ...entry.aliases]) this.aliasIndex.set(normalizeLocationText(alias), { alias, location });
    }
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
