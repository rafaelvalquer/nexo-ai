import { describe, expect, it } from "vitest";
import { emailSendCapabilityRemediation, isEmailSendRequest } from "../../packages/core/src/agent/orchestrator/email-capability-remediation.js";

describe("email send capability remediation", () => {
  it("recognizes Portuguese send and reply requests", () => {
    expect(isEmailSendRequest("Envie e-mail para rafael@example.com falando Oi")).toBe(true);
    expect(isEmailSendRequest("Mande para rafael@example.com falando Oi")).toBe(true);
    expect(isEmailSendRequest("Responda o e-mail dizendo obrigado")).toBe(true);
    expect(isEmailSendRequest("Quais são meus últimos e-mails?")).toBe(false);
  });

  it("returns the exact reauthorization path when email.send is missing", () => {
    const text = emailSendCapabilityRemediation({
      status: "missing_capability",
      account: { provider: "google", accountEmail: "rafael@example.com" }
    } as any);
    expect(text).toContain("rafael@example.com");
    expect(text).toContain("Enviar e-mails");
    expect(text).toContain("Salvar e reautorizar");
  });

  it("returns no remediation when the capability is ready", () => {
    expect(emailSendCapabilityRemediation({ status: "ready", account: {} } as any)).toBeUndefined();
  });
});
