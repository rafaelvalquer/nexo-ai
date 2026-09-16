import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nearestExistingAncestor } from "../../packages/core/src/security/nearest-existing-ancestor.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe("nearestExistingAncestor", () => {
  it("returns the closest physical ancestor and all missing segments", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-ancestor-"));
    temporaryDirectories.push(root);
    const target = path.join(root, "A", "B", "teste.txt");

    expect(nearestExistingAncestor(target)).toEqual({
      existingPath: root,
      missingSegments: ["A", "B", "teste.txt"],
    });
  });

  it("returns the target itself when it already exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-ancestor-"));
    temporaryDirectories.push(root);
    const target = path.join(root, "existing");
    await fs.mkdir(target);

    expect(nearestExistingAncestor(target)).toEqual({ existingPath: target, missingSegments: [] });
  });
});
