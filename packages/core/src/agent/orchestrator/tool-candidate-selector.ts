import type { AgentToolDescriptor } from "./tool-catalog.js";
import type { AgentModelMessage } from "../loop/types.js";

const DEFAULT_MAX_TOOLS = 10;

type DomainRule = { domain: string; pattern: RegExp };
const DOMAIN_RULES: DomainRule[] = [
  { domain: "system", pattern: /\b(computador|pc|sistema|hardware|cpu|process|processo|ram|mem[oó]ria|disco|armazenamento|gpu|desempenho|lento)\b/i },
  { domain: "filesystem", pattern: /\b(arquivo|arquivos|pasta|pastas|download|downloads|documentos?|documents?|desktop|diret[oó]rio|diretorios?|pdf|docx?|xlsx?|txt|jpg|png|mp4)\b/i },
  { domain: "email", pattern: /\b(e-?mail|e-?mails|gmail|caixa de entrada|mensagem(?:ns)? recebida(?:s)?|remetente|assunto)\b/i },
  { domain: "calendar", pattern: /\b(agenda|calend[aá]rio|compromisso|compromissos|reuni[aã]o|reuni[oõ]es|evento|eventos|convite)\b/i },
  { domain: "browser", pattern: /\b(internet|web|site|p[aá]gina|navegador|browser|chrome|edge|github|infomoney|uol|g1|linkedin|youtube|not[ií]cia|not[ií]cias)\b|https?:\/\//i },
  { domain: "memory", pattern: /\b(lembre|lembrar|mem[oó]ria local|memorize|guarde|recorde|esque[cç]a)\b/i },
  { domain: "application", pattern: /\b(aplicativo|aplica[cç][aã]o|programa|vscode|visual studio code|android studio|explorer)\b/i }
];

const READ_HINT = /\b(liste|listar|mostre|mostrar|veja|ver|procure|procurar|pesquise|pesquisar|busque|buscar|analise|analisar|resuma|resumir|compare|comparar|quais|qual|quanto|quantos|[uú]ltim|recente)\b/i;
const MUTATION_HINT = /\b(crie|criar|envie|enviar|mande|mandar|apague|apagar|delete|deletar|remova|remover|mova|mover|renomeie|renomear|edite|editar|arquive|arquivar|marque|marcar|salve|salvar)\b/i;

const TOOL_HINTS: Array<[RegExp, string[]]> = [
  [/\b(analise|analisar).*(computador|pc)|\b(computador|pc).*(desempenho|lento|an[aá]lise)\b/i, ["daily_summary", "system_info", "memory_usage", "disk_usage", "process_list"]],
  [/\b(ram|mem[oó]ria).*(uso|usad|dispon[ií]vel)|\b(uso|usad).*(ram|mem[oó]ria)\b/i, ["memory_usage", "system_info"]],
  [/\b(ram|mem[oó]ria).*(total|tem|possui)|\bquanto.*(ram|mem[oó]ria)\b/i, ["system_info", "memory_usage"]],
  [/\bdisco.*(uso|ocupad|espa[cç]o)|\b(espa[cç]o|uso).*\bdisco\b/i, ["disk_usage"]],
  [/\bprocessos?|cpu\b/i, ["process_list", "system_info"]],
  [/\b([uú]ltim[oa]|mais recente).*(e-?mail|gmail)|\b(e-?mail|gmail).*(mais recente|[uú]ltim[oa])\b/i, ["email_latest", "email_search", "email_get"]],
  [/\b(resuma|resumir|liste|listar|mostre|mostrar|procure|pesquise).*(e-?mail|gmail)|\b(e-?mail|gmail).*(resuma|liste|mostre|procure|pesquise)\b/i, ["email_search", "email_get_many", "email_get", "email_latest"]],
  [/\b(envie|enviar|mande|mandar).*(e-?mail)|\be-?mail.*(envie|enviar|mande|mandar)\b/i, ["email_send_composed", "email_create_draft", "email_send"]],
  [/\b(liste|listar|mostre|mostrar|quais).*(arquivo|pasta|download)|\b(arquivo|pasta|download).*(liste|listar|mostre|mostrar|quais)\b/i, ["list_files", "file_info", "search_files"]],
  [/\b(procure|procurar|pesquise|buscar|busque|encontre).*(arquivo|pasta)|\b(arquivo|pasta).*(procure|pesquise|buscar|busque|encontre)\b/i, ["search_files", "file_info", "list_files"]],
  [/\b(crie|criar).*(pasta|diret[oó]rio)\b/i, ["create_folder"]],
  [/\b(agenda|calend[aá]rio|compromisso|reuni[aã]o).*(amanh[aã]|hoje|semana|pr[oó]xim)|\b(o que tenho).*(amanh[aã]|agenda)\b/i, ["calendar_list", "calendar_search", "calendar_get"]],
  [/\b(crie|agende|marque).*(reuni[aã]o|evento|compromisso)\b/i, ["calendar_create", "calendar_create_meeting"]],
  [/\b(infomoney|uol|g1|github|linkedin|youtube|site|web|internet).*(not[ií]cia|verifique|pesquise|procure|veja|analise)|\b(not[ií]cia|verifique|pesquise|procure|veja|analise).*(infomoney|uol|g1|github|site|web|internet)\b/i, ["browser_agent_run", "browser_open", "browser_navigate", "browser_extract"]],
  [/\b(abra|abrir|acesse|acessar|entre|entrar|navegue|navegar).*(site|github|infomoney|uol|g1|linkedin|youtube)|https?:\/\//i, ["browser_open", "browser_agent_run", "browser_navigate"]]
];

export class ToolCandidateSelector {
  constructor(private readonly maxTools = DEFAULT_MAX_TOOLS) {}

  select(userRequest: string, tools: AgentToolDescriptor[], context: AgentModelMessage[] = []): AgentToolDescriptor[] {
    if (tools.length <= this.maxTools) return tools;
    const contextText = context.slice(-4).map(message => message.content).filter(Boolean).join(" ");
    const text = `${contextText} ${userRequest}`.trim();
    const domains = new Set(DOMAIN_RULES.filter(rule => rule.pattern.test(text)).map(rule => rule.domain));
    const preferred = new Map<string, number>();
    for (const [pattern, names] of TOOL_HINTS) {
      if (!pattern.test(text)) continue;
      names.forEach((name, index) => preferred.set(name, Math.max(preferred.get(name) ?? 0, 200 - index * 8)));
    }
    const tokens = tokenize(text);
    const mutationRequested = MUTATION_HINT.test(userRequest);
    const readRequested = READ_HINT.test(userRequest) && !mutationRequested;
    const ranked = tools.map((tool, index) => {
      let score = preferred.get(tool.name) ?? 0;
      if (domains.has(tool.domain)) score += 100;
      if (!domains.size && tokens.some(token => tool.name.toLowerCase().includes(token))) score += 45;
      const haystack = `${tool.name} ${tool.description} ${tool.operation} ${tool.domain}`.toLowerCase();
      for (const token of tokens) if (token.length >= 3 && haystack.includes(token)) score += 4;
      if (tool.mutatesState && readRequested) score -= 120;
      if (tool.mutatesState && mutationRequested) score += 15;
      if (!tool.mutatesState) score += 3;
      return { tool, score, index };
    });
    let selected = ranked.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, this.maxTools).map(item => item.tool);
    if (!selected.length) selected = ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, this.maxTools).map(item => item.tool);
    for (const [name] of [...preferred.entries()].sort((a, b) => b[1] - a[1])) {
      const tool = tools.find(item => item.name === name);
      if (!tool || selected.some(item => item.name === name)) continue;
      if (selected.length >= this.maxTools) selected.pop();
      selected.unshift(tool);
    }
    return selected.slice(0, this.maxTools);
  }
}

function tokenize(text: string) {
  return [...new Set(text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().split(/[^a-z0-9_]+/).filter(token => token.length >= 3))];
}
