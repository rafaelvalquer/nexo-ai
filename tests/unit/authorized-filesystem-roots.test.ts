import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocationRegistry } from "../../packages/core/src/locations/location-registry.js";
import { PathIntentResolver } from "../../packages/core/src/locations/path-intent-resolver.js";
import { PathPolicy } from "../../packages/core/src/security/path-policy.js";
import { V2FastPathRouter } from "../../packages/core/src/agent/loop/v2-fast-path.js";

describe("authorized filesystem roots", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-authorized-roots-"));
  const projects = path.join(sandbox, "Projetos");
  const other = path.join(sandbox, "Fora");
  fs.mkdirSync(projects, { recursive: true });
  fs.mkdirSync(other, { recursive: true });

  afterAll(() => fs.rmSync(sandbox, { recursive: true, force: true }));

  it("registers an arbitrary authorized root as a natural-language location", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const resolved = new PathIntentResolver(locations).resolve("Projetos\\Nexo\\SubPasta");

    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedPath: path.join(projects, "Nexo", "SubPasta"),
    });
  });

  it("routes text-file creation through an arbitrary authorized-root alias", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const router = new V2FastPathRouter(locations);
    const result = router.resolve(
      "Crie o arquivo qualquer-pasta.txt em Projetos\\Nexo com o conteúdo Funciona fora de Downloads.",
      [{ name: "create_text_file" } as any],
    );

    expect(result).toMatchObject({
      name: "create_text_file",
      arguments: {
        path: path.join(projects, "Nexo", "qualquer-pasta.txt"),
        content: "Funciona fora de Downloads.",
      },
    });
  });

  it("accepts absolute destinations independently of known-folder names", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const destination = path.join(projects, "Absoluto");
    const router = new V2FastPathRouter(locations);
    const result = router.resolve(
      `Crie o arquivo absoluto.txt em ${destination} com o conteúdo Caminho absoluto autorizado.`,
      [{ name: "create_text_file" } as any],
    );

    expect(result).toMatchObject({
      name: "create_text_file",
      arguments: {
        path: path.join(destination, "absoluto.txt"),
        content: "Caminho absoluto autorizado.",
      },
    });
  });

  it("allows descendants of an authorized root and rejects sibling escape", () => {
    const policy = new PathPolicy(() => [projects]);

    expect(policy.isAllowed(path.join(projects, "Nexo", "arquivo.txt"))).toBe(true);
    expect(policy.isAllowed(path.join(projects, "..", "Fora", "arquivo.txt"))).toBe(false);
  });

  it("does not create an ambiguous basename alias for two roots with the same name", () => {
    const first = path.join(sandbox, "A", "Compartilhado");
    const second = path.join(sandbox, "B", "Compartilhado");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    const locations = new LocationRegistry({}, [], [first, second]);

    expect(locations.resolveAlias("Compartilhado")).toBeUndefined();
    expect(new PathIntentResolver(locations).resolve(first).status).toBe("resolved");
    expect(new PathIntentResolver(locations).resolve(second).status).toBe("resolved");
  });
});
