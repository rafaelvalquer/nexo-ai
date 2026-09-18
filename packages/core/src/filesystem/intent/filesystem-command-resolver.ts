import path from "node:path";
import { LocationRegistry, normalizeLocationText } from "../../locations/location-registry.js";
import { PathIntentResolver } from "../../locations/path-intent-resolver.js";
import { normalizeFilename } from "../filename-normalizer.js";
import type { FilesystemCommand } from "./filesystem-command-types.js";

const CREATE = /\b(?:crie|criar|gere|gerar|salve|salvar|grave|gravar|escreva|escrever)\s+(?:(?:um|uma|o|a)\s+)?(?:arquivo(?:\s+(?:de\s+texto|textual))?(?:\s+chamad[oa])?\s+)?["“']?([\p{L}\p{N}_ .-]+\.(?:txt|md|csv))["”']?/iu;
const CONTENT = /\s+(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+escreva)\b\s*:?[\s]*/iu;
const FIND_PREFIX = /\b(?:procure|procurar|pesquise|pesquisar|busque|buscar|encontre|encontrar|localize|ache)\s+(?:(?:o|um|uma)\s+)?(?:(?:arquivo|documento)\s+)?/iu;

/** Shared deterministic grammar for the simple filesystem commands used by both routers. */
export class FilesystemCommandResolver {
  unsupportedSpreadsheetCreation(text: string) {
    if (!/\b(?:crie|criar|gere|gerar)\b/i.test(text)) return undefined;
    const file = text.match(/[\p{L}\p{N}_ .-]+\.(?:xlsx?|xlsm)\b/iu)?.[0]?.trim();
    return file ? `Ainda não consigo criar planilhas (${file}); use o Excel Pack quando estiver disponível. Não criei nem alterei nenhum arquivo.` : undefined;
  }

  resolve(text: string, allowedRoots: string[] = [], locationRegistry?: LocationRegistry, previousFiles: Array<{name:string;path:string}> = []): FilesystemCommand | undefined {
    if(/\b(?:procure|procurar|pesquise|pesquisar|busque|buscar|encontre|localize|ache)\b/i.test(text)&&/\b(?:resuma|resumir|analise|analisar|leia|ler|explique)\b/i.test(text)&&/\b(?:crie|criar|gere|gerar|salve|salvar|escreva|escrever|exporte|exportar)\b/i.test(text))return undefined;
    const create = this.resolveCreate(text, allowedRoots, locationRegistry);
    if (create) return create;

    const folder = this.resolveCreateFolder(text, allowedRoots, locationRegistry);
    if (folder) return folder;

    const priorFile=previousFiles.length===1?previousFiles[0]:undefined;
    if(priorFile&&/\b(?:abra|abrir|abre|open)\b/i.test(text)&&/\b(?:esse|este|essa|esta|anterior|encontrado)\b/i.test(text)&&/\barquivo\b/i.test(text))return{kind:"open_file",path:priorFile.path,confidence:1};
    if(priorFile&&/\b(?:analise|analisar|resuma|resumir|leia|ler|explique)\b/i.test(text)&&/\b(?:esse|este|essa|esta|anterior|encontrado)\b/i.test(text)&&/\barquivo\b/i.test(text))return{kind:"analyze_file",path:priorFile.path,confidence:1};

    const find = this.resolveFind(text, allowedRoots, locationRegistry);
    if (find) return find;

    const largest = this.resolveLargest(text, allowedRoots, locationRegistry);
    if (largest) return largest;

    const list = this.resolveList(text, allowedRoots, locationRegistry);
    if (list) return list;

    const search = this.resolveGenericSearch(text, allowedRoots, locationRegistry);
    if (search) return search;
    return undefined;
  }

  private resolveCreate(text: string, roots: string[], locations?: LocationRegistry) {
    const match = CREATE.exec(text);
    if (!match || match.index === undefined) return undefined;
    const fileName = match[1]?.trim().replace(/[.!?]+$/, "");
    if (!fileName) return undefined;
    const tail = text.slice(match.index + match[0].length);
    const destinationStart = tail.match(/^\s+(?:(?:especificamente|exatamente|diretamente|somente|apenas)\s+)*(?:em|no|na|nos|nas|para|dentro\s+de)\s+/iu);
    if (!destinationStart) return undefined;
    const rest = tail.slice(destinationStart[0].length);
    const contentMarker = CONTENT.exec(rest);
    const destinationText = cleanFolder((contentMarker?.index === undefined ? rest : rest.slice(0, contentMarker.index)));
    const destination = this.resolveFolder(destinationText, roots, locations);
    if (!destination) return undefined;
    const content = contentMarker?.index === undefined ? "" : rest.slice(contentMarker.index + contentMarker[0].length).trim();
    return { kind: "create_text_file" as const, fileName, destination, content, confidence: 1 };
  }

  private resolveCreateFolder(text: string, roots: string[], locations?: LocationRegistry) {
    if(CREATE.test(text))return undefined;
    if (!/\b(?:crie|criar)\b/i.test(text) || !/\b(?:pasta|diret[oó]rio)\b/i.test(text)) return undefined;
    const named = text.match(/\b(?:pasta|diret[oó]rio)(?:\s+(?:chamad[oa]|com\s+nome))?\s+["“']?([\p{L}\p{N}_ .-]+?)["”']?(?:\s+(?:em|no|na|para|dentro\s+de)\s+(.+?))?[.!?]*$/iu);
    if (!named?.[1]) return undefined;
    const name = named[1].trim();
    const destination = named[2] ? this.resolveFolder(cleanFolder(named[2]), roots, locations) : undefined;
    if (named[2] && !destination) return undefined;
    return { kind: "create_folder" as const, folderName: name, ...(destination ? { destination } : {}), confidence: 1 };
  }

  private resolveFind(text: string, roots: string[], locations?: LocationRegistry) {
    const prefix = FIND_PREFIX.exec(text);
    if (!prefix) return undefined;
    const tail = text.slice(prefix.index + prefix[0].length).trim();
    const quoted = tail.match(/["“']([^"”']+)["”']/u)?.[1];
    const source = quoted ?? tail.split(/\s+(?:em|no|na|nos|nas|dentro\s+de)\s+/iu, 1)[0]?.replace(/[.!?]+$/, "").trim();
    if (!source) return undefined;
    if (/^(?:arquivos?|pastas?|pdfs?|documents?|documentos?|imagens?|fotos?)$/iu.test(source)) return undefined;
    if (/\b(?:contendo|que\s+contenham?|com\s+nome)\b/i.test(source)) return undefined;
    if (/\s/.test(source) && !quoted && !/[.]/.test(source)) return undefined;
    const matchMode: "full_name" | "stem" = path.extname(source) ? "full_name" : "stem";
    const folderText = tail.match(/\b(?:em|no|na|nos|nas|dentro\s+de)\s+(.+?)\s*[.!?]*$/iu)?.[1];
    const folder = folderText ? this.resolveFolder(cleanFolder(folderText), roots, locations) : undefined;
    if (folderText && !folder) return undefined;
    return { kind: "find_file" as const, name: source, matchMode, ...(folder ? { folder } : {}), confidence: 1 };
  }

  private resolveList(text: string, roots: string[], locations?: LocationRegistry) {
    if (!/\b(?:liste|listar|lista|mostre|mostrar|veja|ver)\b/i.test(text)) return undefined;
    const folderText = text.match(/\b(?:em|no|na|nos|nas|de|do|da)\s+(.+?)\s*[.!?]*$/iu)?.[1] ?? text.match(/\b(?:downloads?|documents?|documentos?|desktop|[aá]rea\s+de\s+trabalho)\b/iu)?.[0];
    if (!/\b(?:arquivos?|pastas?|itens?)\b/i.test(text) && !folderText) return undefined;
    const folder = folderText && this.resolveFolder(cleanFolder(folderText), roots, locations);
    return folder ? { kind: "list_files" as const, folder, confidence: 1 } : undefined;
  }

  private resolveLargest(text: string, roots: string[], locations?: LocationRegistry) {
    if (!/\b(?:maiores?|mais\s+pesados?|ocupam?\s+mais\s+espa[cç]o|arquivos?\s+grandes?)\b/i.test(text)) return undefined;
    if (!/\b(?:analise|analisar|liste|listar|mostre|mostrar|veja|ver|quais|encontre|encontrar)\b/i.test(text)) return undefined;
    const folderText = text.match(/\b(?:em|no|na|nos|nas|de|do|da)\s+(.+?)\s*[.!?]*$/iu)?.[1]
      ?? text.match(/\b(?:downloads?|documents?|documentos?|desktop|[aá]rea\s+de\s+trabalho)\b/iu)?.[0];
    const folder = folderText && this.resolveFolder(cleanFolder(folderText), roots, locations);
    return folder ? { kind: "largest_files" as const, folder, confidence: 1 } : undefined;
  }

  private resolveGenericSearch(text: string, roots: string[], locations?: LocationRegistry) {
    if (!/\b(?:procure|pesquise|busque|encontre)\b/i.test(text) || !/\b(?:arquivos?|contendo|que\s+contenham?|pdfs?|imagens?)\b/i.test(text)) return undefined;
    const explicitTerm = text.match(/\b(?:contendo|que\s+contenham?|com\s+nome)\s+["“']?(.+?)["”']?(?:\s+em\s+.+)?[.!?]*$/iu)?.[1]?.trim();
    const simpleTerm = text.match(/\b(?:procure|pesquise|busque|encontre)\s+(?:os?\s+)?arquivos?\s+(.+?)(?=\s+(?:em|no|na|nos|nas|dentro\s+de)\s+|\s+e\s+(?:compare|ordene|classifique|analise)\b|[.!?]*$)/iu)?.[1]?.trim();
    const term = (explicitTerm ?? simpleTerm)?.replace(/^["“']|["”']$/g, "").trim().toLowerCase();
    const folderText = text.match(/\b(?:em|no|na|nos|nas)\s+(.+?)\s*[.!?]*$/iu)?.[1];
    const folder = folderText && this.resolveFolder(cleanFolder(folderText), roots, locations);
    if (!term && !/\b(?:pdfs?|imagens?)\b/i.test(text)) return undefined;
    return { kind: "search_files" as const, query: term?.toLowerCase() ?? `.${text.match(/\b(pdfs?|png|jpe?g)\b/i)?.[1]?.replace(/s$/i, "").toLowerCase() ?? ""}`, ...(folder ? { folder } : {}), confidence: .95 };
  }

  private resolveFolder(value: string, roots: string[], registry?: LocationRegistry) {
    if (!value || value.split(/[\\/]+/).some(part => part === ".." || part === ".")) return undefined;
    const locations = registry ?? new LocationRegistry({}, [], roots);
    const firstPart = value.split(/[\\/]+/, 1)[0]?.trim() ?? value;
    const alias = locations.resolveAlias(firstPart);
    if (alias) {
      const identity = normalizeLocationText(String(alias.id));
      const matchingRoot = roots.find(root => normalizeLocationText(path.basename(root)) === identity);
      if (matchingRoot) {
        const remainder = value.slice(firstPart.length).replace(/^[\\/]+/, "");
        if (remainder.split(/[\\/]+/).some(part => part === ".." || part === ".")) return undefined;
        return path.normalize(remainder ? path.join(matchingRoot, ...remainder.split(/[\\/]+/)) : matchingRoot);
      }
    }
    const resolved = new PathIntentResolver(locations).resolve(value);
    if (resolved.status !== "resolved" || !resolved.resolvedPath) return undefined;
    return path.normalize(resolved.resolvedPath);
  }
}

function cleanFolder(value: string) {
  return value.trim().replace(/^(?:a\s+)?pasta\s+/iu, "").replace(/^['"“”]|['"“”]$/g, "").replace(/[,:;.!?]+$/g, "").trim();
}


export function filesystemCommandTool(command: import("./filesystem-command-types.js").FilesystemCommand) {
  switch (command.kind) {
    case "find_file": return { tool: "find_file", input: { name: command.name, matchMode: command.matchMode, ...(command.folder ? { root: command.folder } : {}) }, explanation: `Procurando ${command.name}${command.matchMode === "stem" ? " em todas as extensões" : ""} nas pastas autorizadas…` };
    case "create_text_file": return { tool: "create_text_file", input: { path: path.join(command.destination, command.fileName), content: command.content }, explanation: `Preparando a criação de ${command.fileName}…` };
    case "create_folder": return { tool: "create_folder", input: { path: command.destination ? path.join(command.destination, command.folderName) : command.folderName }, explanation: `Preparando a criação da pasta ${command.folderName}…` };
    case "largest_files": return { tool: "largest_files", input: { path: command.folder, limit: 15, maxDepth: 4 }, explanation: `Analisando os maiores arquivos em ${command.folder}…` };
    case "list_files": return { tool: "list_files", input: { path: command.folder }, explanation: `Listando itens em ${command.folder}…` };
    case "search_files": return { tool: "search_files", input: { ...(command.folder ? { path: command.folder } : {}), query: command.query, maxDepth: 6 }, explanation: `Pesquisando ${command.query}…` };
    case "open_file": return { tool: "open_path", input: { path: command.path }, explanation: `Abrindo ${path.basename(command.path)}…` };
    case "analyze_file": return { tool: "document_summarize", input: { path: command.path, instruction: "Resuma e analise o arquivo, destacando seus principais pontos." }, explanation: `Analisando ${path.basename(command.path)}…` };
  }
}

export function fileMatchMode(name: string) { return path.extname(name) ? "full_name" as const : "stem" as const; }
export function normalizedStem(name: string) { return normalizeFilename(path.parse(name).name); }
