import type { LLMProvider } from "../llm/provider.js";
import { AGENT_SYSTEM_PROMPT, stripCodeFence } from "../security/prompt.js";
import { ToolRegistry } from "../tools/registry.js";
import { FastIntentRouter } from "./intent-router.js";

export type PlanStep = { tool: string; input: Record<string, unknown>; explanation?: string };
export type PlanOrigin = "fast" | "llm";
export type Plan = {
  tool?: string;
  input?: Record<string, unknown>;
  explanation?: string;
  steps?: PlanStep[];
  direct?: string;
  directStream?: boolean;
  origin?: PlanOrigin;
};

const fastRouter = new FastIntentRouter();

function isLikelyConversation(text: string) {
  const normalized = text.trim().toLowerCase();

  // Pedidos explicitamente educacionais/conversacionais devem ir direto ao chat.
  if (/^(me\s+)?ensine\b|^(me\s+)?explique\b|^me\s+ajude\s+(?:a\s+)?(?:aprender|entender|estudar)\b|^vamos\s+conversar\b/i.test(normalized)) {
    return true;
  }

  const hasComputerAction = /\b(abra|abrir|liste|listar|procure|pesquise|salve|salvar|guarde|lembre|apague|remova|delete|execute|rode|mova|copie|renomeie|crie\s+(?:uma\s+)?pasta|navegue|acesse|baixe|analise\s+(?:a\s+)?pasta)\b/i.test(normalized);
  if (hasComputerAction) return false;

  if (/^\s*(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/i.test(normalized)) return true;
  if (/^\s*(quem|o que|oque|como|por que|porque|qual|quais|quando|onde|explique|resuma|conte|escreva|diga|pode me explicar)\b/i.test(normalized)) return true;

  // Frases sem verbos de ação do computador são tratadas como conversa por padrão.
  return !/\b(arquivo|pasta|navegador|aplicativo|programa|processo|disco|mem[oó]ria|download|desktop|documentos)\b/i.test(normalized);
}

export class AgentPlanner {
  constructor(private llm: LLMProvider, private registry: ToolRegistry) {}

  async plan(userText: string): Promise<Plan> {
    const local = fastRouter.route(userText);
    if (local) return { ...local, origin: "fast" };

    // Conversas comuns não passam pelo planner. Assim evitamos timeout e dupla geração.
    if (isLikelyConversation(userText)) {
      return { directStream: true, origin: "fast" };
    }

    const toolList = this.registry.list().map(t => `${t.name}: ${t.description} [${t.risk}]`).join("\n");
    const prompt = `${AGENT_SYSTEM_PROMPT}\n\nFerramentas disponíveis:\n${toolList}\n\nPara conversa sem ação no computador, retorne JSON {\"direct\":\"resposta\"}. Para ações, selecione somente ferramentas disponíveis.`;
    const raw = await this.llm.plan([{ role: "system", content: prompt }, { role: "user", content: userText }]);
    const cleaned = stripCodeFence(raw);

    try {
      const parsed = JSON.parse(cleaned) as any;
      if (parsed?.tool && this.registry.get(parsed.tool)) {
        return { tool: parsed.tool, input: parsed.input ?? {}, explanation: parsed.explanation, origin: "llm" };
      }
      if (Array.isArray(parsed?.steps)) {
        const validSteps = parsed.steps.filter((step: any) => step?.tool && this.registry.get(step.tool));
        if (validSteps.length) return { steps: validSteps, origin: "llm" };
      }
      if (typeof parsed?.direct === "string") {
        return { direct: parsed.direct, origin: "llm" };
      }
    } catch {
      // Texto puro do planner pode ser reutilizado como resposta final.
    }

    return { direct: raw, origin: "llm" };
  }

  async streamDirectAnswer(userText: string, onToken: (token: string) => void) {
    const prompt = [
      "Você é o Nexo AI, um assistente local.",
      "Responda em português de forma clara e objetiva.",
      "Responda somente ao pedido do usuário.",
      "Não exponha raciocínio interno ou cadeia de pensamento.",
      "Você pode usar memórias locais apenas quando elas forem fornecidas explicitamente no contexto.",
      "Não afirme que executou ações no computador nesta resposta.",
      "Se o pedido exigir uma ação no computador, informe que ela deve passar pelas ferramentas controladas do Nexo."
    ].join("\n");

    return this.llm.stream(
      [{ role: "system", content: prompt }, { role: "user", content: userText }],
      onToken
    );
  }
}
