import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandService } from "../../packages/core/src/application/command-service.js";
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
    expect(await commands.resolve("verifique uso da memória")).toMatchObject({ type: "tool", tool: "memory_usage" });
    expect(await commands.resolve("Busque arquivos Nexo e compare as datas.")).toMatchObject({ type: "tool", tool: "search_files", input: { query: "nexo" } });
    expect(await commands.resolve("Dos arquivos anteriores, qual deles é o segundo?", { updatedAt: new Date().toISOString(), files: [{ name: "manual.txt", path: "C:\\Downloads\\manual.txt" }, { name: "contrato.pdf", path: "C:\\Downloads\\contrato.pdf" }] })).toMatchObject({ type: "tool", tool: "file_info", input: { path: "C:\\Downloads\\contrato.pdf" } });
    expect(await commands.resolve("vamos conversar sobre javascript")).toMatchObject({ type: "chat", stream: true });
    expect(await commands.resolve("Crie teste.txt em Downloads\\NexoTeste")).toMatchObject({ type: "tool", tool: "create_text_file", responseMode: "deterministic" });
    const cases:[string,"tool"|"macro",string][]=[
      ["Abra o Chrome.","tool","open_application"],
      ["Liste os arquivos de Downloads.","tool","list_files"],
      ["Procure relatorio.csv","tool","find_file"],
      ["Mostre os programas consumindo mais memória.","tool","process_list"],
      ["Abra https://github.com.","tool","browser_open"],
      ["Quais são minhas macros?","macro","list"],
      ["Execute a macro Trabalho.","macro","run"]
    ];
    for(const [text,type,value] of cases)expect(await commands.resolve(text)).toMatchObject(type==="tool"?{type,tool:value}:{type,operation:value});

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-command-service-"));
    directories.push(directory);
    const db = new NexoDatabase(directory); await db.ready();
    const streamDirectAnswer = vi.fn(async () => "resposta local");
    const executeMemory = vi.fn(async () => ({ success: true, ok: true, summary: "Memória disponível", data: { usedPercent: 20 } }));
    const memoryTool = registry.get("memory_usage");
    if (!memoryTool) throw new Error("A ferramenta memory_usage deve estar registrada");
    registry.register({ ...memoryTool, execute: executeMemory });
    const graphFactory = vi.fn(() => ({} as any));
    const metrics = { record: vi.fn() };
    const plan = vi.fn(() => { throw new Error("AgentPlanner deve ficar fora do caminho determinístico"); });
    const observe = vi.fn(() => ({} as any));
    const planner = { streamDirectAnswer:vi.fn(()=>{throw new Error("Chat simples não deve chamar AgentPlanner");}), plan, observe } as any;
    const directChat={stream:streamDirectAnswer} as any;
    const engine = new AgentEngine(planner, registry, new PermissionEngine(() => ({ autonomy: "balanced", allowedRoots: [], memoryEnabled: false, memoryAskBeforeSave: false, privateMode: false } as any)), new ApprovalService(db), new AuditService(db), undefined, undefined, undefined, metrics as any, undefined, undefined, () => "legacy", undefined, graphFactory, undefined, undefined, commands,directChat);
    await expect(engine.run("vamos conversar sobre javascript")).resolves.toMatchObject({ text: "resposta local", engine: "fast-path" });
    expect(streamDirectAnswer).toHaveBeenCalledOnce();
    expect(planner.streamDirectAnswer).not.toHaveBeenCalled();
    expect(graphFactory).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(metrics.record).toHaveBeenCalledWith("agent.command_route.type",1,{type:"chat",source:expect.any(String)});

    await expect(engine.run("verifique uso da memória")).resolves.toMatchObject({ text: "Memória disponível", engine: "fast-path", toolsUsed: ["memory_usage"] });
    expect(executeMemory).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledOnce();
    expect(plan).not.toHaveBeenCalled();
    expect(metrics.record).toHaveBeenCalledWith("agent.command_route.tool",1,{tool:"memory_usage",source:"exact"});
  });
});
