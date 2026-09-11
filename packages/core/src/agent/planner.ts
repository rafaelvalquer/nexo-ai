import path from "node:path";
import os from "node:os";
import type { LLMProvider } from "../llm/provider.js";
import { AGENT_SYSTEM_PROMPT, stripCodeFence } from "../security/prompt.js";
import { ToolRegistry } from "../tools/registry.js";

export type PlanStep = { tool: string; input: Record<string, unknown>; explanation?: string };
export type Plan = { tool?: string; input?: Record<string, unknown>; explanation?: string; steps?: PlanStep[]; direct?: string };

function expandKnownPaths(text: string) {
  return text
    .replace(/\bDownloads\b/gi, path.join(os.homedir(), "Downloads"))
    .replace(/\bDocumentos\b/gi, path.join(os.homedir(), "Documents"))
    .replace(/\bDesktop\b/gi, path.join(os.homedir(), "Desktop"));
}

function deterministicPlan(text: string): Plan | null {
  const normalized = text.toLowerCase();
  if (/computador.*lento|pc.*lento/.test(normalized)) return { steps:[
    {tool:"system_info",input:{},explanation:"Coletando informações do sistema…"},
    {tool:"memory_usage",input:{},explanation:"Verificando uso de memória…"},
    {tool:"disk_usage",input:{},explanation:"Verificando espaço em disco…"},
    {tool:"process_list",input:{limit:12},explanation:"Analisando processos em execução…"}
  ]};
  if (/uso.*mem[oó]ria|mem[oó]ria.*uso/.test(normalized)) return { tool:"memory_usage", input:{}, explanation:"Verificando o uso de memória…" };
  if (/uso.*disco|disco.*ocupado/.test(normalized)) return { tool:"disk_usage", input:{}, explanation:"Verificando o uso dos discos…" };
  const app=text.match(/\babra\s+(?:o\s+)?(chrome|google chrome|edge|microsoft edge|vscode|visual studio code|android studio|explorer)\b/i);
  if(app) return {tool:"open_application",input:{application:app[1]},explanation:`Abrindo ${app[1]}…`};
  const list = text.match(/(?:liste|mostre|ver)\s+(?:os\s+)?arquivos.*?(Downloads|Documentos|Desktop|[A-Za-z]:\\[^\n]+)/i);
  if (list) return { tool:"list_files", input:{path:expandKnownPaths(list[1])}, explanation:"Listando os arquivos solicitados…" };
  const search = text.match(/(?:encontre|procure|pesquise).*?([^\s]+\.(?:pdf|docx?|xlsx?|txt|jpg|png)|pdfs?|arquivos?).*?(?:em|na pasta)?\s*(Downloads|Documentos|Desktop)?/i);
  if (search && search[2]) return { tool:"search_files", input:{path:expandKnownPaths(search[2]),query: search[1].replace(/s$/i,"")}, explanation:"Pesquisando os arquivos…" };
  return null;
}

export class AgentPlanner {
  constructor(private llm: LLMProvider, private registry: ToolRegistry) {}

  async plan(userText: string): Promise<Plan> {
    const local = deterministicPlan(userText);
    if (local) return local;
    const toolList = this.registry.list().map(t=>`${t.name}: ${t.description} [${t.risk}]`).join("\n");
    const prompt = `${AGENT_SYSTEM_PROMPT}\n\nFerramentas disponíveis:\n${toolList}`;
    const raw = await this.llm.chat([{role:"system",content:prompt},{role:"user",content:expandKnownPaths(userText)}]);
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
