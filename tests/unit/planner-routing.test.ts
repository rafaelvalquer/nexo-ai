import { describe, expect, it } from "vitest";
import type { LLMMessage, LLMProvider } from "../../packages/core/src/llm/provider.js";
import { AgentPlanner } from "../../packages/core/src/agent/planner.js";
import { CommandService } from "../../packages/core/src/agent/command-service.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { ConversationContextBuilder } from "../../packages/core/src/agent/context/conversation-context.js";
import { AgentEngine } from "../../packages/core/src/agent/engine.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
import { AuditService } from "../../packages/core/src/audit/audit.js";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

class FakeLLM implements LLMProvider {
  planCalls = 0;
  streamCalls = 0;

  async chat(_messages: LLMMessage[]) { return "ok"; }
  async stream(_messages: LLMMessage[], onToken: (token: string) => void) {
    this.streamCalls++;
    onToken("resposta");
    return "resposta";
  }
  async plan(_messages: LLMMessage[]) {
    this.planCalls++;
    return JSON.stringify({ direct: "fallback" });
  }
  async summarize(_text: string) { return "resumo"; }
  async embed(_text: string) { return []; }
  async health() { return { ok: true, detail: "ok" }; }
  async models() { return ["qwen3:4b"]; }
}

describe("AgentPlanner routing", () => {
  it("envia conversa educacional direto para streaming sem chamar planner", async () => {
    const llm = new FakeLLM();
    const planner = new AgentPlanner(llm, new ToolRegistry());
    const plan = await planner.plan("me ensine javascript");
    expect(plan.directStream).toBe(true);
    expect(llm.planCalls).toBe(0);
  });

  it("classifica conversas e comandos locais antes da fase de planejamento", () => {
    const commands = new CommandService(new ToolRegistry());
    expect(commands.route("vamos conversar sobre javascript")).toMatchObject({ type: "chat", stream: true });
    expect(commands.route("verifique uso da memória")).toMatchObject({ type: "tool", tool: "memory_usage" });
    expect(commands.route("execute uma ação avançada no meu ambiente")).toMatchObject({ type: "unknown" });
    expect(commands.route("Crie teste.txt em Downloads\\NexoTeste")).toMatchObject({ type: "tool", tool: "create_text_file" });
    expect(commands.route("Crie stale.txt na pasta permitida")).toMatchObject({ type: "unknown" });
    expect(commands.route("Encontre contrato.pdf em Downloads, resuma e salve dynamic.md")).toMatchObject({ type: "unknown" });
  });

  it("preserva caminhos explicitamente citados ao despachar listagens determinísticas", () => {
    const commands = new CommandService(new ToolRegistry());
    const folder = path.join(os.tmpdir(), "nexo quoted path");
    const plan=commands.route(`Liste os arquivos da pasta "${folder}"`);
    expect(plan).toMatchObject({ type: "tool", tool: "list_files", input: { path: folder } });
  });

  it.each([
    ["abrir navegador", "browser_launch"],
    ["listar arquivos da pasta download", "list_files"],
    ["qual o meu nome?", "memory_search"],
    ["Resumo diário", "daily_summary"]
  ])("resolve %s sem chamar planner", async (text, tool) => {
    const llm = new FakeLLM();
    const planner = new AgentPlanner(llm, new ToolRegistry());
    const plan = await planner.plan(text);
    expect(plan.tool).toBe(tool);
    expect(llm.planCalls).toBe(0);
  });

  it("usa planner somente para ação não reconhecida e ambígua", async () => {
    const llm = new FakeLLM();
    const planner = new AgentPlanner(llm, new ToolRegistry());
    const plan = await planner.plan("execute uma ação avançada no meu ambiente");
    expect(plan.direct).toBe("fallback");
    expect(llm.planCalls).toBe(1);
  });
});

describe("ConversationContextBuilder", () => {
  it("keeps recent user and assistant messages within a bounded context", () => {
    const context = new ConversationContextBuilder().build([{id:"1",role:"user",content:"mensagem anterior",createdAt:"2026-01-01"},{id:"2",role:"assistant",content:"resposta anterior",createdAt:"2026-01-01"}], 12, 100);
    expect(context).toEqual([{role:"user",content:"mensagem anterior"},{role:"assistant",content:"resposta anterior"}]);
  });
});

describe("ToolResultInterpreter", () => {
  it("asks the model for a bounded final synthesis of tool results", async () => {
    const planner = new AgentPlanner(new FakeLLM(), new ToolRegistry());
    await expect(planner.interpretToolResults("verifique", [{ok:true,summary:"2 itens",data:{items:[1,2]}}])).resolves.toBe("ok");
  });
});

describe("AgentEngine tool loop", () => {
  it("returns to the model after a tool result and persists the run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-agent-loop-"));
    const db = new NexoDatabase(dir); await db.ready();
    class LoopLLM extends FakeLLM {
      override async plan() { this.planCalls++; return this.planCalls === 1 ? JSON.stringify({tool:"memory_usage",input:{}}) : JSON.stringify({direct:"Diagnóstico analisado."}); }
    }
    try {
      const llm = new LoopLLM();
      const registry = new ToolRegistry();
      const memoryUsage = registry.get("memory_usage");
      if (!memoryUsage) throw new Error("memory_usage não registrada no teste");
      memoryUsage.execute = async () => ({ ok:true, summary:"Memória simulada para o loop.", data:{ usedPercent:42 } });
      const planner = new AgentPlanner(llm, registry);
      const engine = new AgentEngine(planner, registry, new PermissionEngine(() => ({ autonomy:"balanced", allowedRoots:[], memoryEnabled:false, memoryAskBeforeSave:false, privateMode:false } as any)), new ApprovalService(db), new AuditService(db), undefined, new AgentRuntime(db));
      await expect(engine.run("execute uma ação avançada no meu ambiente")).resolves.toMatchObject({text:"Diagnóstico analisado."});
      expect(llm.planCalls).toBe(2); expect(db.get<{status:string}>("SELECT status FROM agent_runs LIMIT 1")?.status).toBe("COMPLETED");
    } finally { fs.rmSync(dir, { recursive:true, force:true }); }
  });
});
