import type { BrowserAgentMode } from "@nexo/shared/browser-agent";
import type { SecurityPolicyService } from "../security/policy.js";

const KNOWN_SITE_DOMAINS: Array<[RegExp,string]> = [
  [/\binfomoney\b/i,"*.infomoney.com.br"],
  [/\bvalor econômico|\bvalor economico|\bvalor inviste\b/i,"*.valor.globo.com"],
  [/\binvesting(?:\.com)?\b/i,"*.investing.com"],
  [/\bg1\b/i,"*.g1.globo.com"],
  [/\buol\b/i,"*.uol.com.br"],
  [/\bgithub\b/i,"*.github.com"],
  [/\blinkedin\b/i,"*.linkedin.com"],
  [/\byoutube\b/i,"*.youtube.com"]
];

export class BrowserAgentPolicy {
  constructor(private readonly security: SecurityPolicyService) {}
  assertEnabled() { this.security.assertToolEnabled("browser_agent_run"); }
  normalizeDomains(domains: string[]) {
    return [...new Set(domains.map(value => value.trim().toLowerCase()).filter(Boolean).map(value => value.replace(/^https?:\/\//, "").replace(/\/.*$/, "")))];
  }
  assertMode(mode: BrowserAgentMode, personalEnabled: boolean) {
    if (mode === "personal" && !personalEnabled) throw new Error("O perfil pessoal do Browser Agent não está habilitado. Ative-o em Configurações > Segurança antes de acessar contas autenticadas.");
  }
  domainsFromRequest(request: string) {
    const domains = new Set<string>();
    for (const match of request.matchAll(/https?:\/\/([^\s/]+)/gi)) domains.add(wildcardHost(match[1]));
    for (const match of request.matchAll(/\b([a-z0-9][a-z0-9-]{1,62}\.(?:com|com\.br|net|org|io|ai|dev|app|gov\.br|edu\.br))\b/gi)) domains.add(wildcardHost(match[1]));
    for (const [pattern, domain] of KNOWN_SITE_DOMAINS) if (pattern.test(request)) domains.add(domain);
    return [...domains];
  }
}

function wildcardHost(raw:string) {
  const host=raw.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  return host.startsWith("*.") ? host : `*.${host}`;
}
