import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";
import { LocationRegistry } from "../../packages/core/src/locations/location-registry.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

const temporaryDirectories: string[] = [];
const audit = { record() {} } as any;

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe("Agent V2 location filesystem binding", () => {
  it("creates missing parent directories and ignores a model-proposed destination", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-location-e2e-"));
    temporaryDirectories.push(root);
    const downloads = path.join(root, "Downloads");
    const outside = path.join(root, "model-choice", "teste.txt");
    const expected = path.join(downloads, "NexoTeste", "teste.txt");
    const request = "Crie teste.txt em Downloads\\NexoTeste";
    const executor = new ActionExecutor(
      new ToolRegistry(),
      new PermissionEngine(() => ({ allowedRoots: [root], autonomy: "balanced" } as any)),
      audit,
      { locations: new LocationRegistry({ home: root, downloads }) },
    );

    const preflight = await executor.preflight("create_text_file", { path: outside, content: "conteúdo" }, { userRequest: request });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.action.input.path).toBe(expected);

    const execution = await executor.executePrepared(preflight.action, { userRequest: request, dispatchAuthorized: true });
    expect(execution.status).toBe("SUCCEEDED");
    expect(await fs.readFile(expected, "utf8")).toBe("conteúdo");
    await expect(fs.stat(path.dirname(expected))).resolves.toMatchObject({});
    await expect(fs.stat(outside)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not overwrite an existing create target", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-location-e2e-"));
    temporaryDirectories.push(root);
    const downloads = path.join(root, "Downloads");
    const target = path.join(downloads, "teste.txt");
    await fs.mkdir(downloads, { recursive: true });
    await fs.writeFile(target, "original");
    const request = "Crie teste.txt em Downloads";
    const executor = new ActionExecutor(
      new ToolRegistry(),
      new PermissionEngine(() => ({ allowedRoots: [root], autonomy: "balanced" } as any)),
      audit,
      { locations: new LocationRegistry({ home: root, downloads }) },
    );

    const preflight = await executor.preflight("create_text_file", { path: path.join(root, "wrong.txt"), content: "novo" }, { userRequest: request });
    expect(preflight).toMatchObject({ ok: false, code: "PATH_DENIED", message: "FILE_ALREADY_EXISTS" });
    expect(await fs.readFile(target, "utf8")).toBe("original");
  });
});
