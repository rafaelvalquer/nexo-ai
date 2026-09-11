import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { filesystemTools } from "../../packages/core/src/tools/filesystem/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("filesystem tools", () => {
  it("lista nomes de arquivos no resumo", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-list-"));
    tempDirs.push(dir);
    await fs.writeFile(path.join(dir, "arquivo.txt"), "conteudo");

    const tool = filesystemTools().find(item => item.name === "list_files")!;
    const input = tool.inputSchema.parse({ path: dir });
    const result = await tool.execute(input);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("arquivo.txt");
  });

  it("ordena maiores arquivos por tamanho", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-largest-"));
    tempDirs.push(dir);
    await fs.writeFile(path.join(dir, "pequeno.bin"), Buffer.alloc(10));
    await fs.writeFile(path.join(dir, "grande.bin"), Buffer.alloc(2048));

    const tool = filesystemTools().find(item => item.name === "largest_files")!;
    const input = tool.inputSchema.parse({ path: dir, limit: 10, maxDepth: 1 });
    const result = await tool.execute(input);
    const data = result.data as { files: Array<{ name: string; size: number }> };

    expect(result.ok).toBe(true);
    expect(data.files[0].name).toBe("grande.bin");
    expect(data.files[0].size).toBe(2048);
    expect(result.summary).toContain("grande.bin");
  });
});
