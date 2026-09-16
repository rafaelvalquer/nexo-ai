import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";

const inputSchema = z.object({ path: z.string().min(1), content: z.string() });

export function textFileTools(): ToolDefinition[] {
  return [
    {
      name: "create_text_file", description: "Cria um arquivo textual novo sem sobrescrever arquivos existentes", domain: "filesystem", operation: "create", risk: "SAFE_WRITE", permissions: ["filesystem.write"], pathFields: ["path"], mutatesState: true,
      mutationSafety: { idempotency: "nexo", reconciliation: "supported" }, inputSchema,
      execute: async ({ path: target, content }, context) => atomicTextWrite(target, content, true, context?.executionId)
    },
    {
      name: "write_text_file", description: "Substitui atomicamente o conteúdo de um arquivo textual existente", domain: "filesystem", operation: "write", risk: "SENSITIVE", permissions: ["filesystem.write"], pathFields: ["path"], mutatesState: true,
      mutationSafety: { idempotency: "nexo", reconciliation: "supported" }, inputSchema,
      execute: async ({ path: target, content }, context) => atomicTextWrite(target, content, false, context?.executionId)
    }
  ];
}

export async function atomicTextWrite(target: string, content: string, create: boolean, executionId = "local") {
  const bytes = Buffer.from(content, "utf8");
  let previousHash: string | undefined;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("TARGET_NOT_FILE");
    if (create) throw new Error("FILE_ALREADY_EXISTS");
    previousHash = sha256(await fs.readFile(target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!create) throw new Error("FILE_NOT_FOUND");
  }
  await fs.access(path.dirname(path.resolve(target)));
  const temporary = path.join(path.dirname(target), `.nexo-temp-${executionId}-${path.basename(target)}`);
  const handle = await fs.open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const expectedHash = sha256(bytes);
    if (sha256(await fs.readFile(temporary)) !== expectedHash) throw new Error("TEMPORARY_CONTENT_HASH_MISMATCH");
    if (create) {
      try { await fs.link(temporary, target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("FILE_ALREADY_EXISTS"); throw error; }
      await fs.unlink(temporary);
    } else {
      const currentHash = sha256(await fs.readFile(target));
      if (currentHash !== previousHash) throw new Error("FILE_CHANGED_DURING_WRITE");
      await fs.rename(temporary, target);
    }
    if (sha256(await fs.readFile(target)) !== expectedHash) throw new Error("DESTINATION_CONTENT_HASH_MISMATCH");
    crashAfterCommitForTest();
    return { ok: true, summary: `${create ? "Arquivo criado" : "Arquivo atualizado"}: ${target}`, data: { path: target, bytesWritten: bytes.length, sha256: expectedHash, created: create } };
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function crashAfterCommitForTest() {
  if (process.env.NODE_ENV === "test" && process.env.NEXO_TEST_CRASH_AFTER_FILESYSTEM_COMMIT === "1") process.kill(process.pid);
}
