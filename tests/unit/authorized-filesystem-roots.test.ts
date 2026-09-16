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

  it("routes listing through an arbitrary authorized-root alias", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const result = new V2FastPathRouter(locations).resolve(
      "Liste os arquivos em Projetos\\Nexo",
      [{ name: "list_files" } as any],
    );

    expect(result).toMatchObject({
      name: "list_files",
      arguments: { path: path.join(projects, "Nexo") },
    });
  });

  it("routes folder creation through an arbitrary authorized-root alias", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const result = new V2FastPathRouter(locations).resolve(
      "Crie a pasta NovaPasta em Projetos\\Nexo",
      [{ name: "create_folder" } as any],
    );

    expect(result).toMatchObject({
      name: "create_folder",
      arguments: { path: path.join(projects, "Nexo", "NovaPasta") },
    });
  });

  it("rejects traversal in list requests instead of falling back to the root alias", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const result = new V2FastPathRouter(locations).resolve(
      "Liste os arquivos em Projetos\\..\\Fora",
      [{ name: "list_files" } as any],
    );

    expect(result).toMatchObject({ rejected: true, code: "PATH_TRAVERSAL_DENIED" });
  });

  it("rejects malformed folder destinations instead of silently using a nearby alias", () => {
    const locations = new LocationRegistry({}, [], [projects]);
    const result = new V2FastPathRouter(locations).resolve(
      "Crie a pasta Segredo em Projetos....\\Fora",
      [{ name: "create_folder" } as any],
    );

    expect(result).toMatchObject({ rejected: true, code: "PATH_NOT_RECOGNIZED" });
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

  it("deduplicates equivalent Windows roots case-insensitively", () => {
    const locations = new LocationRegistry({}, [], ["D:\\Projetos", "d:\\projetos\\"]);
    const authorized = locations.getKnownLocations().filter(item => item.source === "settings");

    expect(authorized).toHaveLength(1);
    expect(locations.resolveAlias("Projetos")?.path).toBe("D:\\Projetos");
  });

  it("does not expose a drive root as a natural-language basename alias", () => {
    const locations = new LocationRegistry({}, [], ["D:\\"]);

    expect(locations.getKnownLocations().some(item => item.source === "settings" && item.path === "D:\\")).toBe(true);
    expect(locations.getAliases().some(item => item.location.source === "settings")).toBe(false);
    expect(new PathIntentResolver(locations).resolve("D:\\Projetos").status).toBe("resolved");
  });
});
