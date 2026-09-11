import { describe, expect, it } from "vitest";
import type { LLMMessage, LLMProvider } from "../../packages/core/src/llm/provider.js";
import { AgentPlanner } from "../../packages/core/src/agent/planner.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

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
