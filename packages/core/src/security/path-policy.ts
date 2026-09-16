import fs from "node:fs";
import path from "node:path";

const BLOCKED_WINDOWS_FRAGMENTS = ["\\windows", "\\program files", "\\appdata"];

/** Resolves links/junctions before deciding whether a filesystem target is inside an allowed root. */
export class PathPolicy {
  constructor(private readonly allowedRoots: () => string[]) {}

  isAllowed(target: string): boolean {
    try {
      const physicalTarget = this.physicalTarget(target);
      if (process.platform === "win32" && BLOCKED_WINDOWS_FRAGMENTS.some(fragment => physicalTarget.includes(fragment))) return false;
      return this.allowedRoots().some(root => {
        const physicalRoot = this.realpathWithMissingSuffix(root);
        return physicalTarget === physicalRoot || physicalTarget.startsWith(`${physicalRoot}${path.sep}`);
      });
    } catch {
      return false;
    }
  }

  assertAllowed(target: string): void {
    if (!this.isAllowed(target)) throw new Error(`Caminho físico fora do escopo permitido: ${target}`);
  }

  private physicalTarget(target: string): string {
    const resolved = path.resolve(target);
    return this.realpathWithMissingSuffix(resolved);
  }

  private realpathExisting(target: string): string {
    return fs.realpathSync.native(path.resolve(target)).toLowerCase();
  }

  private realpathWithMissingSuffix(target:string):string{
    let cursor=path.resolve(target);const suffix:string[]=[];
    while(!fs.existsSync(cursor)){const parent=path.dirname(cursor);if(parent===cursor)throw new Error(`Nenhum ancestral existente para ${target}`);suffix.unshift(path.basename(cursor));cursor=parent;}
    return path.join(this.realpathExisting(cursor),...suffix).toLowerCase();
  }
}
