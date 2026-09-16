import fs from "node:fs";
import path from "node:path";

export interface ExistingAncestorResult {
  existingPath: string;
  missingSegments: string[];
}

/**
 * Finds the closest existing ancestor without requiring the requested target to
 * exist. The returned suffix is kept lexical; callers must resolve the existing
 * ancestor physically before making an authorization decision.
 */
export function nearestExistingAncestor(target: string): ExistingAncestorResult {
  let cursor = path.resolve(target);
  const missingSegments: string[] = [];

  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Nenhum ancestral existente para ${target}`);
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }

  return { existingPath: cursor, missingSegments };
}
