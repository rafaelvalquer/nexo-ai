import type { SystemLocation } from "../../locations/location-registry.js";
import { LocationRegistry } from "../../locations/location-registry.js";
import { PathIntentResolver } from "../../locations/path-intent-resolver.js";

export type ResolvedKnownFolder = { id: SystemLocation | string; path: string; confidence: number; matchedAlias: string; relativePath?: string };

/** Compatibility facade for callers that still resolve known folders at preflight. */
export class KnownFolderResolver {
  private readonly paths: PathIntentResolver;

  constructor(private readonly locations: LocationRegistry = new LocationRegistry()) {
    this.paths = new PathIntentResolver(locations);
  }

  resolve(value: string): ResolvedKnownFolder | undefined {
    const resolution = this.paths.resolve(value);
    if (resolution.status !== "resolved" || !resolution.resolvedPath || !resolution.location) return undefined;
    return {
      id: resolution.location.id,
      path: resolution.resolvedPath,
      confidence: resolution.location.confidence,
      matchedAlias: value,
      relativePath: resolution.relativePath,
    };
  }
}
