import type { IntentDomain } from "./intent-schema.js";

export type DomainHint = { domain: IntentDomain; confidence: number; reason: string };

export function resolveDomainHint(text: string): DomainHint | undefined {
  const value = text.toLowerCase();
  const matches: DomainHint[] = [];
  const add = (domain: IntentDomain, confidence: number, reason: string) => matches.push({ domain, confidence, reason });

  if (/\b(e-?mails?|gmail|caixa\s+de\s+entrada|remetente|destinat[aá]rio)\b/i.test(value)) add("email", .99, "email-keyword");
  if (/\b(agenda|calend[aá]rio|compromissos?|reuni[aã]o|eventos?|convites?)\b/i.test(value)) add("calendar", .99, "calendar-keyword");
  if (/\b(arquivos?|pastas?|downloads?|baixados|documentos?|documents?|desktop|[aá]rea\s+de\s+trabalho|\.csv\b|\.pdf\b|\.txt\b|\.xlsx?\b|\.docx?\b)\b/i.test(value)) add("filesystem", .98, "filesystem-keyword");
  if (/\b(navegador|browser|site|p[aá]gina|chrome|edge|youtube|instagram|github\.com)\b|https?:\/\//i.test(value)) add("browser", .96, "browser-keyword");
  if (/\b(mem[oó]ria\s+do\s+nexo|lembre|memorize|esque[cç]a\s+meu|minhas?\s+prefer[eê]ncias?)\b/i.test(value)) add("memory", .9, "memory-keyword");
  if (/\b(cpu|processos?|uso\s+de\s+mem[oó]ria|uso\s+de\s+disco|computador|pc\s+lento)\b/i.test(value)) add("system", .9, "system-keyword");

  if (!matches.length) return undefined;
  matches.sort((a, b) => b.confidence - a.confidence);
  const best = matches[0];
  const competing = matches.find(item => item.domain !== best.domain && item.confidence >= best.confidence - .02);
  return competing ? { ...best, confidence: .72, reason: `${best.reason}+ambiguous` } : best;
}
