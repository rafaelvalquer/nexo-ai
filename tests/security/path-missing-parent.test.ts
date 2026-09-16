import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PathPolicy } from "../../packages/core/src/security/path-policy.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe("PathPolicy with nonexistent targets", () => {
  it("allows missing nested destinations when their physical ancestor is inside an allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-policy-root-"));
    temporaryDirectories.push(root);
    const policy = new PathPolicy(() => [root]);

    expect(policy.isAllowed(path.join(root, "A", "B", "teste.txt"))).toBe(true);
  });

  it("rejects missing destinations outside allowed roots", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-policy-root-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-policy-outside-"));
    temporaryDirectories.push(root, outside);
    const policy = new PathPolicy(() => [root]);

    expect(policy.isAllowed(path.join(outside, "A", "teste.txt"))).toBe(false);
  });

  it("rejects a missing target reached through a symlink that escapes the allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-policy-root-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-policy-outside-"));
    temporaryDirectories.push(root, outside);
    const link = path.join(root, "escape");
    try {
      await fs.symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch {
      return;
    }
    const policy = new PathPolicy(() => [root]);

    expect(policy.isAllowed(path.join(link, "missing", "teste.txt"))).toBe(false);
  });
});
