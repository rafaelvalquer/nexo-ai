export type SensitiveBrowserAction = { reason: string; preview: string };

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(purchase|buy|checkout|placeOrder|confirmOrder|comprar|finalizar compra)\b/i, "Confirmar uma compra"],
  [/\b(delete|remove|destroy|excluir|apagar)\b/i, "Excluir ou remover informação"],
  [/\b(publish|post|send|submit|enviar|publicar)\b/i, "Enviar ou publicar informação"],
  [/\b(password|passwd|credential|senha|login|sign.?in)\b/i, "Usar credencial ou autenticação"],
  [/\b(update|save|edit|alterar|salvar)\b/i, "Alterar informação em um site"]
];

export class BrowserAgentPolicy {
  static normalizeDomains(domains: string[]) {
    return [...new Set(domains.map(value => value.trim().toLowerCase()).filter(Boolean).map(value => value.replace(/^https?:\/\//, "").replace(/\/.*$/, "")))];
  }

  static sensitiveAction(toolName: string, input: unknown): SensitiveBrowserAction | undefined {
    const serialized = `${toolName}\n${safeStringify(input)}`.slice(0, 12_000);
    const inspected = serialized.replace(/\bbrowser\.send\b/gi, "browser.cdp").replace(/\bpostMessage\b/gi, "message");
    for (const [pattern, reason] of SENSITIVE_PATTERNS) {
      if (pattern.test(inspected)) return { reason, preview: BrowserAgentPolicy.publicPreview(inspected) };
    }
    return undefined;
  }

  static publicPreview(value: string) {
    return value
      .replace(/(password|passwd|senha|token|authorization|cookie)\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=[redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
      .slice(0, 800);
  }
}

function safeStringify(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
