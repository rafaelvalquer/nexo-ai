import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandService } from "../../packages/core/src/agent/command-service.js";
import { AgentEngine } from "../../packages/core/src/agent/engine.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
import { AuditService } from "../../packages/core/src/audit/audit.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("CommandService", () => {
  it("routes deterministic local reads and conversation without consulting AgentPlanner", async () => {
    const registry = new ToolRegistry();
    const commands = new CommandService(registry);
    expect(commands.route("verifique uso da memória")).toMatchObject({ type: "tool", tool: "memory_usage" });
    expect(commands.route("vamos conversar sobre javascript")).toMatchObject({ type: "chat", stream: true });
    expect(commands.route("Crie teste.txt em Downloads\\NexoTeste")).toMatchObject({ type: "unknown" });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-command-service-"));
    directories.push(directory);
    const db = new NexoDatabase(directory); await db.ready();
    const streamDirectAnswer = vi.fn(async () => "resposta local");
    const graphFactory = vi.fn(() => ({} as any));
    const plan = vi.fn(() => { throw new Error("AgentPlanner deve ficar fora do caminho determinístico"); });
    const planner = { streamDirectAnswer, plan } as any;
    const engine = new AgentEngine(planner, registry, new PermissionEngine(() => ({ autonomy: "balanced", allowedRoots: [], memoryEnabled: false, memoryAskBeforeSave: false, privateMode: false } as any)), new ApprovalService(db), new AuditService(db), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, graphFactory, undefined, undefined, commands);
    await expect(engine.run("vamos conversar sobre javascript")).resolves.toMatchObject({ text: "resposta local", engine: "fast-path" });
    expect(streamDirectAnswer).toHaveBeenCalledOnce();
    expect(graphFactory).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });
});
