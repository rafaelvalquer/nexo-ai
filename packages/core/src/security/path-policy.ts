import fs from "node:fs";
import path from "node:path";
import { nearestExistingAncestor } from "./nearest-existing-ancestor.js";

const BLOCKED_WINDOWS_FRAGMENTS = ["\\windows", "\\program files", "\\appdata"];

/** Resolves links/junctions before deciding whether a filesystem target is inside an allowed root. */
export class PathPolicy {
  constructor(private readonly allowedRoots: () => string[]) {}

  isAllowed(target: string): boolean {
    try {
      const physicalTarget = this.physicalTarget(target);
      return this.allowedRoots().some(root => {
        const physicalRoot = this.realpathWithMissingSuffix(root);
        const insideRoot = physicalTarget === physicalRoot || physicalTarget.startsWith(`${physicalRoot}${path.sep}`);
        if (!insideRoot) return false;

        // Sensitive Windows areas remain blocked when they are merely nested under
        // a broader root (for example HOME -> AppData). An explicitly configured
        // root inside that area is authoritative and may be used safely; this is
        // required for legitimate app/test workspaces under the OS temp directory.
        if (isBlockedWindowsPath(physicalTarget) && !isBlockedWindowsPath(physicalRoot)) return false;
        return true;
      });
    } catch {
      return false;
    }
  }

  assertAllowed(target: string): void {
    if (!this.isAllowed(target)) throw new Error(`Caminho físico fora do escopo permitido: ${target}`);
  }

  private physicalTarget(target: string): string {
    return this.realpathWithMissingSuffix(path.resolve(target));
  }

  private realpathExisting(target: string): string {
    return fs.realpathSync.native(path.resolve(target)).toLowerCase();
  }

  private realpathWithMissingSuffix(target: string): string {
    const { existingPath, missingSegments } = nearestExistingAncestor(target);
    return path.join(this.realpathExisting(existingPath), ...missingSegments).toLowerCase();
  }
}

function isBlockedWindowsPath(value: string) {
  return process.platform === "win32" && BLOCKED_WINDOWS_FRAGMENTS.some(fragment => value.includes(fragment));
}
