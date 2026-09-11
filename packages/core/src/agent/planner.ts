import path from "node:path";
import os from "node:os";
import type { LLMProvider } from "../llm/provider.js";
import { AGENT_SYSTEM_PROMPT, stripCodeFence } from "../security/prompt.js";
import { ToolRegistry } from "../tools/registry.js";

export type PlanStep = { tool: string; input: Record<string, unknown>; explanation?: string };
export type Plan = { tool?: string; input?: Record<string, unknown>; explanation?: string; steps?: PlanStep[]; direct?: string };

import { FastIntentRouter } from "./intent-router.js";

const fastRouter = new FastIntentRouter();

export class AgentPlanner {
  constructor(private llm: LLMProvider, private registry: ToolRegistry) {}

  async plan(userText: string): Promise<Plan> {
    const local = fastRouter.route(userText);
    if (local) return local;
    const toolList = this.registry.list().map(t=>`${t.name}: ${t.description} [${t.risk}]`).join("\n");
    const prompt = `${AGENT_SYSTEM_PROMPT}\n\nFerramentas disponíveis:\n${toolList}`;
    const raw = await this.llm.plan([{role:"system",content:prompt},{role:"user",content:userText}]);
    const cleaned = stripCodeFence(raw);
    try {
      const parsed = JSON.parse(cleaned) as any;
      if (parsed?.tool && this.registry.get(parsed.tool)) return { tool:parsed.tool, input:parsed.input ?? {}, explanation:parsed.explanation };
      if (Array.isArray(parsed?.steps)) return { steps: parsed.steps };
      if (typeof parsed?.direct === "string") return { direct: parsed.direct };
    } catch {}
    return { direct: raw };
  }

  async streamDirectAnswer(userText: string, onToken: (token: string) => void) {
    const prompt = `Você é o Nexo AI, um assistente local. Responda em português de forma clara e objetiva.\n- Ao pensar, descreva seu processo de raciocínio passo a passo, explicando o que está fazendo, semelhante ao Ollama no modo CLI.\n- Responda somente ao pedido do usuário.\n- Não afirme que executou ações no computador nesta resposta.\n- Se o pedido exigir uma ação no computador, informe apenas que ela deve passar pelas ferramentas controladas do Nexo.`;
    return this.llm.stream(
      [{role:"system",content:prompt},{role:"user",content:userText}],
      onToken
    );
  }

}
