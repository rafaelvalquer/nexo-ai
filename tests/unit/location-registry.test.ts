import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocationRegistry } from "../../packages/core/src/locations/location-registry.js";

const previousDownloads = process.env.NEXO_SYSTEM_DOWNLOADS;

afterEach(() => {
  if (previousDownloads === undefined) delete process.env.NEXO_SYSTEM_DOWNLOADS;
  else process.env.NEXO_SYSTEM_DOWNLOADS = previousDownloads;
});

describe("LocationRegistry", () => {
  it("resolves friendly aliases to configured system paths", () => {
    const downloads = path.resolve("/tmp/nexo-downloads");
    const registry = new LocationRegistry({ downloads });

    expect(registry.resolve("downloads")).toMatchObject({ id: "downloads", path: downloads, source: "system" });
    expect(registry.resolveAlias("meus downloads")).toMatchObject({ id: "downloads", path: downloads });
  });

  it("uses OS paths injected by the Electron process", () => {
    const injected = path.resolve("/tmp/nexo-electron-downloads");
    process.env.NEXO_SYSTEM_DOWNLOADS = injected;

    expect(new LocationRegistry().resolve("downloads")?.path).toBe(injected);
  });

  it("supports enabled aliases without replacing known folders", () => {
    const registry = new LocationRegistry({}, [{ id: "projetos", aliases: ["meus projetos"], path: path.resolve("/tmp/projetos"), enabled: true }]);

    expect(registry.resolveAlias("meus projetos")).toMatchObject({ id: "projetos", source: "alias" });
    expect(registry.resolve("documents")?.id).toBe("documents");
  });
});
