import path from "node:path";
import { LocationRegistry } from "../../locations/location-registry.js";
import { PathIntentResolver } from "../../locations/path-intent-resolver.js";
import { containsPathTraversal, parseTextFileIntent } from "../intent/text-file-intent.js";
import type { AgentToolDescriptor } from "../orchestrator/tool-catalog.js";

export type V2FastPathCall = {
  name: string;
  arguments: Record<string, unknown>;
  explanation: string;
};

export type V2FastPathRejection = {
  rejected: true;
  code: "PATH_TRAVERSAL_DENIED" | "PATH_NOT_RECOGNIZED";
  message: string;
  explanation: string;
};

export type V2FastPathResult = V2FastPathCall | V2FastPathRejection;

type FolderResolution = { path: string } | V2FastPathRejection;

export class V2FastPathRouter {
  constructor(private readonly locations: LocationRegistry = new LocationRegistry()) {}

  resolve(text: string, tools: AgentToolDescriptor[]): V2FastPathResult | null {
    const available = new Map(tools.map(tool => [tool.name, tool]));

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

    if(/\b(agenda|calend[aá]rio|compromissos?)\b/i.test(text)&&/\b(hoje|amanh[aã]|depois de amanh[aã])\b/i.test(text)&&!/\b(crie|agende|marque)\b/i.test(text)){
      const naturalDate=/depois de amanh[aã]/i.test(text)?"depois de amanhã":/amanh[aã]/i.test(text)?"amanhã":"hoje";
      const dayPart=/manh[aã]/i.test(text)&&naturalDate!=="amanhã"?"manhã":/tarde/i.test(text)?"tarde":/noite/i.test(text)?"noite":undefined;
      return this.call(available,"calendar_list_agent",{naturalDate,...(dayPart?{dayPart}:{})},"Consultando a agenda…");
    }

    if (available.has("create_text_file")) {
      const textFile = textFileCreation(text, this.locations);
      if (textFile && "rejected" in textFile) return textFile;
      if (textFile) {
        return this.call(
          available,
          "create_text_file",
          { path: textFile.path, content: textFile.content },
          `Preparando a criação de ${path.basename(textFile.path)}…`,
        );
      }
    }

    const isListRequest=/\b(liste|listar|lista|mostre|mostrar|quais|ver|veja)\b/i.test(text);
    const isCreateFolderRequest=/\b(crie|criar)\b.*\b(pasta|diret[oó]rio)\b/i.test(text);
    if(isListRequest||isCreateFolderRequest){
      const folder=resolveFolder(text,this.locations);
      if(folder&&"rejected" in folder)return folder;
      if(folder&&isListRequest){
        const count = requestedCount(text);
        const onlyDirectories = /\b(pastas?|diret[oó]rios?)\b/i.test(text) && !/\barquivos?\b/i.test(text);
        const recent = /(recentes?|mais\s+recentes?|[uú]ltimos?)/i.test(text);
        return this.call(available, "list_files", {
          path: folder.path,
          ...(onlyDirectories ? { kind: "directory" } : {}),
          ...(recent ? { sortBy: "modifiedAt", sortDirection: "desc" } : {}),
          ...(count ? { limit: Math.min(500, count) } : {})
        }, `Listando itens em ${folder.path}…`);
      }

      if(folder&&isCreateFolderRequest){
        const name=text.match(/(?:pasta|diret[oó]rio)(?:\s+chamad[oa])?\s+["']?([\wÀ-ÿ ._-]+?)["']?(?:\s+(?:em|nos?|nas?)\b|$)/i)?.[1]?.trim();
        if(name&&!/[\\/]/.test(name))return this.call(available,"create_folder",{path:path.join(folder.path,name)},`Preparando a criação da pasta ${name}…`);
      }
    }

    const application=text.match(/\b(?:abra|abrir|inicie|iniciar)\s+(?:o\s+)?(?:aplicativo\s+)?([\w .+-]+)$/i)?.[1]?.trim();
    if(application&&!/site|arquivo|pasta|https?/i.test(application))return this.call(available,"open_application",{application},`Preparando a abertura de ${application}…`);

    if (isBrowserResearch(text)) {
      return this.call(available, "browser_agent_run", { request: text, mode: "research" }, "Pesquisando na web…");
    }
    const url = siteFromText(text);
    if (url && /\b(abra|abrir|acesse|acessar|entre|entrar|navegue|navegar|v[aá]\s+para)\b/i.test(text)) {
      return this.call(available, "open_url", { url }, `Preparando a abertura de ${url}…`)
        ?? this.call(available, "browser_open", { url }, `Abrindo ${url}…`);
    }
    return null;
  }

  private call(available: Map<string, AgentToolDescriptor>, name: string, args: Record<string, unknown>, explanation: string): V2FastPathCall | null {
    return available.has(name) ? { name, arguments: args, explanation } : null;
  }
}

function textFileCreation(text: string, locations: LocationRegistry): { path: string; content: string } | V2FastPathRejection | undefined {
  const request = parseTextFileIntent(text);
  if (!request) return undefined;

  if (containsPathTraversal(request.destination)) return traversalRejection();

  const resolution = new PathIntentResolver(locations).resolve(request.destination);
  if (resolution.status !== "resolved" || !resolution.resolvedPath) return pathNotRecognized(request.destination);

  return { path: path.join(resolution.resolvedPath, request.fileName), content: request.content };
}

function requestedCount(text: string) {
  const match = text.match(/(?:[uú]ltim(?:os|as)|primeir(?:os|as)|mostre|liste|listar)?\s*(\d{1,3})\b/i);
  return match ? Number(match[1]) : undefined;
}

function resolveFolder(text:string,locations:LocationRegistry):FolderResolution|undefined{
  const resolver=new PathIntentResolver(locations);
  const destination=destinationPhrase(text);
  if(destination){
    if(containsPathTraversal(destination))return traversalRejection();
    const resolved=resolver.resolve(destination);
    if(resolved.status==="resolved"&&resolved.resolvedPath)return{path:resolved.resolvedPath};
    return pathNotRecognized(destination);
  }

  const absolute=text.match(/\b([A-Za-z]:\\[^\n,;]+)/);
  if(absolute){
    const resolved=resolver.resolve(absolute[1].trim());
    if(resolved.status==="resolved"&&resolved.resolvedPath)return{path:resolved.resolvedPath};
    return pathNotRecognized(absolute[1].trim());
  }

  // Commands such as "liste Downloads" have no preposition. Match every registered
  // location, including arbitrary authorized roots, without hard-coding folder names.
  for(const candidate of locations.getAliases()){
    const expression=new RegExp(`(?:^|\\b)${escapeRegExp(candidate.alias)}(?:\\b|$)`,"i");
    if(expression.test(text))return{path:candidate.location.path};
  }
  return undefined;
}

function traversalRejection():V2FastPathRejection{return{
  rejected:true,
  code:"PATH_TRAVERSAL_DENIED",
  message:"PATH_TRAVERSAL_DENIED: O caminho solicitado contém navegação relativa ('.' ou '..') e foi bloqueado antes de qualquer execução.",
  explanation:"Bloqueando caminho inseguro…",
};}

function pathNotRecognized(destination:string):V2FastPathRejection{return{
  rejected:true,
  code:"PATH_NOT_RECOGNIZED",
  message:`PATH_NOT_RECOGNIZED: Não reconheci com segurança o destino "${destination}". Nenhuma ação foi executada.`,
  explanation:"Validando o destino solicitado…",
};}

function destinationPhrase(text: string) {
  const match = text.match(/(?:\b(?:em|no|na|nos|nas|para)\b|\bdentro\s+de\b)\s+(.+?)\s*$/i);
  if (!match) return undefined;
  return match[1].trim().replace(/[.!?]+$/g, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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