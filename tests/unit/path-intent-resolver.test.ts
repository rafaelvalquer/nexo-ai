import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocationRegistry } from "../../packages/core/src/locations/location-registry.js";
import { PathIntentResolver, damerauLevenshtein } from "../../packages/core/src/locations/path-intent-resolver.js";

describe("PathIntentResolver", () => {
  const downloads = path.resolve("/tmp/nexo-path-intent/Downloads");
  const documents = path.resolve("/tmp/nexo-path-intent/Documents");
  const resolver = new PathIntentResolver(new LocationRegistry({ downloads, documents }));

  it.each(["Download", "Downloads", "meus downloads"])("resolves %s to Downloads", input => {
    const resolution = resolver.resolve(input);
    expect(resolution).toMatchObject({ status: "resolved", resolvedPath: downloads, location: { id: "downloads", confidence: 1 } });
  });

  it.each(["downlaod", "donwload", "dowload"])("auto-corrects the typo %s with high confidence", input => {
    const resolution = resolver.resolve(`${input}\\NexoTeste\\teste.txt`);
    expect(resolution.status).toBe("resolved");
    expect(resolution.location?.id).toBe("downloads");
    expect(resolution.location?.confidence).toBeGreaterThanOrEqual(0.92);
    expect(resolution.resolvedPath).toBe(path.join(downloads, "NexoTeste", "teste.txt"));
  });

  it("resolves Portuguese desktop aliases", () => {
    const desktop = path.resolve("/tmp/nexo-path-intent/Desktop");
    const local = new PathIntentResolver(new LocationRegistry({ desktop }));
    expect(local.resolve("Área de Trabalho\\teste.txt").resolvedPath).toBe(path.join(desktop, "teste.txt"));
  });

  it("preserves an absolute Windows path", () => {
    const absolute = "C:\\Temp\\a.txt";
    expect(resolver.resolve(absolute)).toMatchObject({ status: "resolved", resolvedPath: path.win32.normalize(absolute) });
  });

  it("does not allow traversal through a known location", () => {
    expect(resolver.resolve("Downloads\\..\\secret.txt").status).toBe("unresolved");
  });

  it("uses Damerau-Levenshtein so a transposition costs one edit", () => {
    expect(damerauLevenshtein("downlaod", "download")).toBe(1);
  });
});
