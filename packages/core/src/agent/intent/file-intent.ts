export type FileIntent =
  | { kind: "find_file"; fileName: string; folder?: string; confidence: number }
  | { kind: "search_files"; query: string; folder?: string; confidence: number };

const EXTENSION = String.raw`[\p{L}\p{N}][\p{L}\p{N}_+-]{0,15}`;
const FILE_TOKEN = new RegExp(String.raw`([^\\/:*?"<>|\r\n]+?\.${EXTENSION})`, "iu");
const QUOTED_FILE = new RegExp(String.raw`["“”']([^"“”']+?\.${EXTENSION})["“”']`, "iu");

export function parseFileIntent(text: string): FileIntent | undefined {
  const quoted = text.match(QUOTED_FILE)?.[1];
  const rawFilename = quoted ?? text.match(FILE_TOKEN)?.[1];
  const filename = rawFilename?.replace(/^.*\b(?:procure|procurar|pesquise|pesquisar|busque|buscar|encontre|localize|ache|arquivo|documento|resuma|resumir|analise|analisar|leia|ler|explique)\s+/i, "").trim();
  if (filename && /\b(procure|procurar|pesquise|pesquisar|busque|buscar|encontre|localize|ache|arquivo|documento|resuma|resumir|analise|analisar|leia|ler|explique)\b/i.test(text)) {
    const folder = explicitFolder(text);
    return { kind: "find_file", fileName: filename, ...(folder ? { folder } : {}), confidence: 1 };
  }
  if (/\b(procure|procurar|pesquise|pesquisar|busque|buscar|encontre|localize|ache)\b/i.test(text)) {
    const type = text.match(/\b(pdf|docx?|xlsx?|txt|md|csv|json|png|jpe?g)s?\b/i)?.[1];
    const term = text.match(/(?:contendo|que\s+contenham?|com\s+nome|chamado?s?)\s+["“']?(.+?)["”']?(?:\s+em\s+.+)?[.!?]*$/i)?.[1]?.trim();
    if (type || term && !FILE_TOKEN.test(term)) return { kind: "search_files", query: term || `.${type}`, ...(explicitFolder(text) ? { folder: explicitFolder(text) } : {}), confidence: 0.92 };
  }
  return undefined;
}

function explicitFolder(text: string): string | undefined {
  const quoted = text.match(/\b(?:em|na|no|dentro\s+de)\s+["“']([^"”']+)["”']/i)?.[1];
  if (quoted) return quoted.trim();
  const absolute = text.match(/(?:^|\s)([A-Za-z]:[\\/][^\r\n,;]+)/)?.[1]?.replace(/[.!?]+$/, "").trim();
  if (absolute) return absolute;
  return text.match(/\b(?:em|na|no)\s+(Downloads?|Documents?|Documentos?|Desktop|[ÁA]rea\s+de\s+trabalho)\b/i)?.[1];
}
