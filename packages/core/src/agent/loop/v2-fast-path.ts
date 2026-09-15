import path from "node:path";
import os from "node:os";
import type { AgentToolDescriptor } from "../orchestrator/tool-catalog.js";

export type V2FastPathCall = {
  name: string;
  arguments: Record<string, unknown>;
  explanation: string;
};

export class V2FastPathRouter {
  resolve(text: string, tools: AgentToolDescriptor[]): V2FastPathCall | null {
    const available = new Map(tools.filter(tool => !tool.mutatesState || tool.risk === "READ").map(tool => [tool.name, tool]));

    if (/\b(analise|analisar|diagnostique|diagnosticar).*(computador|pc)\b|\b(computador|pc).*(lento|desempenho|an[aá]lise)\b/i.test(text)) {
      return this.call(available, "daily_summary", {}, "Analisando o computador…")
        ?? this.call(available, "system_info", {}, "Coletando informações do sistema…");
    }
    if (/\bquanto.*(?:ram|mem[oó]ria).*(?:tem|possui|total)|\b(?:ram|mem[oó]ria).*(?:total|instalada)\b/i.test(text)) {
      return this.call(available, "system_info", {}, "Coletando informações do sistema…");
    }
    if (/\b(?:uso|usada|usando|dispon[ií]vel).*(?:ram|mem[oó]ria)|\b(?:ram|mem[oó]ria).*(?:uso|usada|usando|dispon[ií]vel)\b/i.test(text)) {
      return this.call(available, "memory_usage", {}, "Verificando o uso de memória…");
    }
    if (/\b(?:uso|espa[cç]o|ocupado).*(?:disco)|\bdisco.*(?:uso|espa[cç]o|ocupado)\b/i.test(text)) {
      return this.call(available, "disk_usage", {}, "Verificando o uso de disco…");
    }

    const mentionsEmail = /\b(e-?mails?|gmail|caixa\s+de\s+entrada|mensagens?\s+recebidas?)\b/i.test(text);
    if (mentionsEmail && /([uú]ltim[oa]|mais\s+recente)/i.test(text) && !/\b(resuma|resumir)\b/i.test(text)) {
      const pluralLatest = /([uú]ltimos|[uú]ltimas)/i.test(text);
      const count = requestedCount(text);
      if (pluralLatest || count) return this.call(available, "email_search", { maxResults: Math.min(50, count ?? 10) }, "Consultando os e-mails mais recentes…");
      return this.call(available, "email_latest", {}, "Buscando o e-mail mais recente…");
    }
    if (mentionsEmail && /\b(liste|listar|mostre|mostrar|quais|ver|veja)\b/i.test(text) && !/\b(resuma|resumir)\b/i.test(text)) {
      const count = requestedCount(text) ?? 20;
      return this.call(available, "email_search", { maxResults: Math.min(50, count) }, "Consultando os e-mails…");
    }

    const folder = knownFolder(text);
    if (folder && /\b(liste|listar|lista|mostre|mostrar|quais|ver|veja)\b/i.test(text)) {
      const count = requestedCount(text);
      const onlyDirectories = /\b(pastas?|diret[oó]rios?)\b/i.test(text) && !/\barquivos?\b/i.test(text);
      const recent = /(recentes?|mais\s+recentes?|[uú]ltimos?)/i.test(text);
      return this.call(available, "list_files", {
        path: folder,
        ...(onlyDirectories ? { kind: "directory" } : {}),
        ...(recent ? { sortBy: "modifiedAt", sortDirection: "desc" } : {}),
        ...(count ? { limit: Math.min(500, count) } : {})
      }, `Listando itens em ${folder}…`);
    }

    if (isBrowserResearch(text)) {
      return this.call(available, "browser_agent_run", { request: text, mode: "research" }, "Pesquisando na web…");
    }
    const url = siteFromText(text);
    if (url && /\b(abra|abrir|acesse|acessar|entre|entrar|navegue|navegar|v[aá]\s+para)\b/i.test(text)) {
      return this.call(available, "browser_open", { url }, `Abrindo ${url}…`);
    }
    return null;
  }

  private call(available: Map<string, AgentToolDescriptor>, name: string, args: Record<string, unknown>, explanation: string): V2FastPathCall | null {
    return available.has(name) ? { name, arguments: args, explanation } : null;
  }
}

function requestedCount(text: string) {
  const match = text.match(/(?:[uú]ltim(?:os|as)|primeir(?:os|as)|mostre|liste|listar)?\s*(\d{1,3})\b/i);
  return match ? Number(match[1]) : undefined;
}

function knownFolder(text: string) {
  if (/\bdownloads?|pasta\s+downloads?\b/i.test(text)) return path.join(os.homedir(), "Downloads");
  if (/\bdocumentos?|documents?\b/i.test(text)) return path.join(os.homedir(), "Documents");
  if (/\bdesktop|[aá]rea\s+de\s+trabalho\b/i.test(text)) return path.join(os.homedir(), "Desktop");
  const absolute = text.match(/\b([A-Za-z]:\\[^\n,;]+)/);
  return absolute?.[1]?.trim();
}

function normalizeUrl(raw: string) {
  const clean = raw.trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function siteFromText(text: string) {
  const explicit = text.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s]*)?)/i);
  if (explicit) return normalizeUrl(explicit[1]);
  const aliases: Array<[RegExp, string]> = [
    [/\binfomoney\b/i, "https://www.infomoney.com.br"],
    [/\bg1\b/i, "https://g1.globo.com"],
    [/\buol\b/i, "https://www.uol.com.br"],
    [/\bgithub\b/i, "https://github.com"],
    [/\blinkedin\b/i, "https://www.linkedin.com"],
    [/\byoutube\b/i, "https://www.youtube.com"]
  ];
  return aliases.find(([pattern]) => pattern.test(text))?.[1];
}

function isBrowserResearch(text: string) {
  const research = /\b(pesquise|pesquisar|procure|procurar|busque|buscar|investigue|analise|leia|resuma|compare|verifique|consulte|encontre|veja)\b/i.test(text);
  const web = /\b(internet|web|site|p[aá]gina|not[ií]cias?|infomoney|uol|g1|github|linkedin|youtube)\b|https?:\/\//i.test(text);
  return research && web;
}
