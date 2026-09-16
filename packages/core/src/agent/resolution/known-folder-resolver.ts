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
    if (resolution.status === "resolved" && resolution.resolvedPath && resolution.location) {
      return {
        id: resolution.location.id,
        path: resolution.resolvedPath,
        confidence: resolution.location.confidence,
        matchedAlias: value,
        relativePath: resolution.relativePath,
      };
    }

    // Preserve the historical safe behavior for an exact known folder followed
    // by traversal: resolve only the authorized folder itself and discard the
    // unsafe suffix instead of returning a path containing "..".
    if (/(^|[\\/])\.\.([\\/]|$)/.test(value)) {
      const head = value.trim().split(/[\\/]/, 1)[0]?.trim();
      const location = head ? this.locations.resolveAlias(head) : undefined;
      if (location) {
        return { id: location.id, path: location.path, confidence: 1, matchedAlias: head! };
      }
    }

    return undefined;
  }
}
