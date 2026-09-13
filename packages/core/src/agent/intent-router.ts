import path from "node:path";
import os from "node:os";
import type { Plan } from "./planner.js";

function homeFolder(name: "Downloads" | "Documents" | "Desktop") {
  return path.join(os.homedir(), name);
}

function knownFolderFromText(text: string): string | null {
  if (/\b(downloads?|pasta\s+downloads?)\b/i.test(text)) return homeFolder("Downloads");
  if (/\b(documentos?|documents?)\b/i.test(text)) return homeFolder("Documents");
  if (/\b(desktop|[aá]rea\s+de\s+trabalho)\b/i.test(text)) return homeFolder("Desktop");
  const absolute = text.match(/\b([A-Za-z]:\\[^\n,;]+)/);
  return absolute?.[1]?.trim() ?? null;
}

function normalizeUrl(raw: string) {
  const clean = raw.trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function siteFromText(text: string): string | null {
  const explicit = text.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s]*)?)/i);
  if (explicit) return normalizeUrl(explicit[1]);
  const aliases: Array<[RegExp, string]> = [
    [/\bgoogle\b/i, "https://www.google.com"],
    [/\binstagram\b/i, "https://www.instagram.com"],
    [/\byoutube\b/i, "https://www.youtube.com"],
    [/\bgithub\b/i, "https://github.com"]
  ];
  return aliases.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function isBrowserAction(text: string) {
  return /\b(abra|abrir|abre|acesse|acessar|entre|entrar|navegue|navegar|ir\s+para)\b/i.test(text) &&
    /\b(navegador|browser|site|p[aá]gina|chrome|edge|google|instagram|youtube|github)|https?:\/\/|\bwww\./i.test(text);
}

export class FastIntentRouter {
  route(text: string): Plan | null {
    const normalized = text.toLowerCase().trim();

    if (/computador.*lento|pc.*lento|porque.*(?:computador|pc).*lento|por que.*(?:computador|pc).*lento/.test(normalized)) {
      return { steps: [
        { tool: "system_info", input: {}, explanation: "Coletando informações do sistema…" },
        { tool: "memory_usage", input: {}, explanation: "Verificando uso de memória…" },
        { tool: "disk_usage", input: {}, explanation: "Verificando espaço em disco…" },
        { tool: "process_list", input: { limit: 12 }, explanation: "Analisando processos em execução…" }
      ] };
    }
    if (/uso.*mem[oó]ria|mem[oó]ria.*uso/.test(normalized)) return { tool: "memory_usage", input: {}, explanation: "Verificando o uso de memória…" };
    if (/uso.*disco|disco.*ocupado/.test(normalized)) return { tool: "disk_usage", input: {}, explanation: "Verificando o uso dos discos…" };
    if (/^\s*resumo\s+di[aá]rio\b/i.test(text)) return { tool: "daily_summary", input: {}, explanation: "Montando seu resumo local do dia…" };

    if (/\b(o que|oque|quais).*(voc[eê]).*(pode|consegue).*(fazer)|\b(capacidades|recursos).*nexo\b/i.test(normalized)) {
      return { direct: [
        "Atualmente o Nexo pode:",
        "• conversar usando o modelo local do Ollama;",
        "• diagnosticar uso de memória, disco e processos;",
        "• listar, pesquisar e analisar arquivos em pastas autorizadas;",
        "• identificar os maiores arquivos de uma pasta;",
        "• abrir aplicativos e um navegador controlado;",
        "• acessar sites pelo Browser Agent;",
        "• salvar, consultar e remover memórias locais;",
        "• executar automações em segundo plano.",
        "",
        "Integrações como Gmail precisam estar conectadas e autorizadas antes de o Nexo poder ler e-mails."
      ].join("\n") };
    }

    const mentionsEmail=/\b(e-?mails?|gmail|caixa\s+de\s+entrada|mensagens?\s+recebidas?)\b/i.test(text);
    if (mentionsEmail && /\b([uú]ltim[oa]|mais\s+recente|recentemente\s+recebido)\b/i.test(text)) {
      return { tool:"email_latest", input:{}, explanation:"Buscando o e-mail mais recente da caixa de entrada…" };
    }
    if (mentionsEmail && /\b(quantos?|quantidade|total)\b/i.test(text)) {
      return { tool:"email_stats", input:{}, explanation:"Consultando as estatísticas da conta de e-mail…" };
    }
    if (mentionsEmail && /\b(n[aã]o lidos?|unread)\b/i.test(text) && /\b(quantos?|quantidade|total)\b/i.test(text)) {
      return { tool:"email_stats", input:{}, explanation:"Consultando a quantidade de e-mails não lidos…" };
    }
    if (mentionsEmail && /\b(n[aã]o lidos?|unread|chegaram|recebidos?)\b/i.test(text)) {
      return { tool:"email_search", input:{unread:true,maxResults:20}, explanation:"Consultando e-mails não lidos na conta conectada…" };
    }
    if (mentionsEmail) return { tool:"email_search", input:{maxResults:20}, explanation:"Consultando a conta de e-mail conectada…" };

    if (/\b(configur|adicion|alter|gerenci).*(pastas?\s+permitidas?)|\bpastas?\s+permitidas?\b/i.test(text)) {
      return { direct: "Abra Configurações → Segurança → Pastas permitidas. Downloads, Documents e Desktop são autorizadas por padrão; você pode adicionar outras pastas manualmente." };
    }

    if (isBrowserAction(text)) {
      const url = siteFromText(text);
      if (url) return { tool: "browser_open", input: { url }, explanation: `Abrindo o navegador e acessando ${url}…` };
      if (/\b(navegador|browser|chrome|edge)\b/i.test(text)) return { tool: "browser_launch", input: {}, explanation: "Abrindo o navegador controlado do Nexo…" };
    }

    const app = text.match(/\b(?:abra|abrir|abre)\s+(?:o\s+)?(chrome|google chrome|edge|microsoft edge|vscode|visual studio code|android studio|explorer)\b/i);
    if (app) return { tool: "open_application", input: { application: app[1] }, explanation: `Abrindo ${app[1]}…` };

    const folder = knownFolderFromText(text);
    if (folder && /\b(maiores?|mais\s+pesados?|ocupam?\s+mais\s+espa[cç]o|arquivos?\s+grandes?)\b/i.test(text)) {
      return { tool: "largest_files", input: { path: folder, limit: 15, maxDepth: 4 }, explanation: `Analisando os maiores arquivos em ${folder}…` };
    }
    if (folder && /\b(liste|listar|lista|mostre|mostrar|ver|veja)\b/i.test(text) && /\barquivos?|itens?\b/i.test(text)) return { tool: "list_files", input: { path: folder }, explanation: `Listando arquivos em ${folder}…` };
    const search = text.match(/(?:encontre|procure|pesquise).*?([^\s]+\.(?:pdf|docx?|xlsx?|txt|jpg|png)|pdfs?|arquivos?)/i);
    if (folder && search) return { tool: "search_files", input: { path: folder, query: search[1].replace(/s$/i, "") }, explanation: "Pesquisando os arquivos…" };

    const saveName = text.match(/meu\s+nome\s+[eé]\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)(?=\s*(?:,|\.|!|\?|$))/i);
    const asksToRemember = /\b(salv|guard|lembr|memor)/i.test(text);
    if (saveName && asksToRemember) return { tool: "memory_save", input: { key: "user.name", value: saveName[1].trim(), category: "profile" }, explanation: "Salvando seu nome na memória local…" };
    const saveNamePrefix = text.match(/(?:salv[ae]|guard[ae]|lembre|memorize)\s+(?:que\s+)?meu\s+nome\s+[eé]\s+([A-Za-zÀ-ÿ\s]+?)(?:[,.!?]|$)/i);
    if (saveNamePrefix) return { tool: "memory_save", input: { key: "user.name", value: saveNamePrefix[1].trim(), category: "profile" }, explanation: "Salvando seu nome na memória local…" };
    if (/qual\s+(?:[eé]\s+)?(?:o\s+)?meu\s+nome|sabe\s+(?:qual\s+[eé]\s+)?(?:o\s+)?meu\s+nome|lembra\s+(?:d[eo]\s+)?meu\s+nome|como\s+eu\s+me\s+chamo/i.test(text)) return { tool: "memory_search", input: { query: "user.name" }, explanation: "Consultando seu nome na memória local…" };
    if (/esque[cç]a\s+(?:o\s+)?meu\s+nome|apague\s+(?:o\s+)?meu\s+nome|remova\s+(?:o\s+)?meu\s+nome/i.test(text)) return { tool: "memory_delete", input: { key: "user.name" }, explanation: "Preparando a remoção do seu nome da memória…" };

    const saveProjectMatch = text.match(/meu\s+projeto\s+([^\s]+)\s+fica\s+em\s+(.+?)(?:[,.]\s|$)/i);
    if (saveProjectMatch && asksToRemember) return { tool: "memory_save", input: { key: `project.${saveProjectMatch[1].toLowerCase()}.path`, value: saveProjectMatch[2].trim(), category: "project" }, explanation: `Salvando caminho do projeto ${saveProjectMatch[1]}…` };

    return null;
  }
}
