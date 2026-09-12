import type { NexoSettings, RiskLevel } from "@nexo/shared";

/** Central enterprise controls. Tools still apply their own input validation. */
export class SecurityPolicyService {
  constructor(private settings: () => NexoSettings) {}

  assertToolEnabled(toolName: string) {
    const current = this.settings();
    if (!current.connectionsEnabled && /^(email|calendar)_/.test(toolName)) throw new Error("Conexões externas foram desativadas pela política de segurança.");
    if (!current.browserAutomationEnabled && toolName.startsWith("browser_")) throw new Error("Automação de navegador foi desativada pela política de segurança.");
    if (!current.fileWritesEnabled && /^(write_|move_|copy_|rename_|delete_|create_)/.test(toolName)) throw new Error("Escritas em arquivos foram desativadas pela política de segurança.");
  }

  requiresApproval(toolName: string, risk: RiskLevel) {
    return this.settings().requireApprovalForEmail && /^(email_send|email_create_draft|email_(archive|trash|mark_|flag))/.test(toolName) || risk === "CRITICAL";
  }

  assertRecipientDomains(recipients: Array<{ email?: string }> | undefined) {
    const allowed = this.settings().allowedDomains.map(domain => domain.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length || !recipients?.length) return;
    const denied = recipients.map(item => item.email?.split("@").at(-1)?.toLowerCase()).find(domain => domain && !allowed.includes(domain));
    if (denied) throw new Error(`O domínio ${denied} não é permitido pela política de segurança.`);
  }
}
