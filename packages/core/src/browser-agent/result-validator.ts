import type { BrowserResearchResult } from "@nexo/shared/browser-agent";

export function validateBrowserResearchResult(value: unknown, allowedDomains: string[], maxItems = 12): BrowserResearchResult {
  if (!value || typeof value !== "object") throw new Error("Resultado do Browser Agent inválido.");
  const raw = value as Partial<BrowserResearchResult>;
  if (typeof raw.summary !== "string" || !Array.isArray(raw.sources) || !Array.isArray(raw.findings)) throw new Error("Resultado estruturado incompleto.");
  if (raw.sources.length > maxItems || raw.findings.length > maxItems) throw new Error("Resultado excedeu a quantidade máxima permitida.");
  const allowed = allowedDomains.map(value => value.toLowerCase());
  const assertUrl = (text: string) => {
    let url: URL;
    try { url = new URL(text); } catch { throw new Error(`Fonte com URL inválida: ${text}`); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Somente fontes HTTP(S) são permitidas.");
    const host = url.hostname.toLowerCase();
    if (allowed.length && !allowed.some(domain => host === domain || host.endsWith(`.${domain}`) || (domain.startsWith("*.") && (host === domain.slice(2) || host.endsWith(`.${domain.slice(2)}`))))) {
      throw new Error(`Fonte fora dos domínios permitidos: ${host}`);
    }
    return url.toString();
  };
  const sources = raw.sources.map(source => {
    if (!source || typeof source.title !== "string" || !source.title.trim() || typeof source.url !== "string") throw new Error("Fonte inválida.");
    return { title: source.title.trim(), url: assertUrl(source.url), ...(source.excerpt ? { excerpt: String(source.excerpt).slice(0, 1000) } : {}) };
  });
  const sourceUrls = new Set(sources.map(source => source.url));
  const findings = raw.findings.map(item => {
    if (!item || typeof item.title !== "string" || !item.title.trim() || typeof item.summary !== "string" || !item.summary.trim() || typeof item.sourceUrl !== "string") throw new Error("Achado inválido.");
    const sourceUrl = assertUrl(item.sourceUrl);
    if (!sourceUrls.has(sourceUrl)) throw new Error(`Achado referencia uma fonte não declarada: ${sourceUrl}`);
    return { title: item.title.trim(), summary: item.summary.trim(), sourceUrl };
  });
  return { summary: raw.summary.trim(), sources, findings };
}
