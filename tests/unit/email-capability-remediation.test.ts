import { describe, expect, it, vi } from "vitest";
import { emailSendCapabilityRemediation, isEmailSendRequest, resolveEmailSendCapability } from "../../packages/core/src/agent/orchestrator/email-capability-remediation.js";

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

  it("revalidates a Google account when email.send was requested but is missing operationally", async () => {
    const account = {
      id: "google-1",
      provider: "google",
      accountEmail: "rafael@example.com",
      capabilities: ["email.read", "email.modify"],
      requestedCapabilities: ["email.read", "email.modify", "email.send"]
    } as any;
    let repaired = false;
    const service = {
      resolveForCapability: vi.fn(() => repaired
        ? { status: "ready", account }
        : { status: "missing_capability", account }),
      test: vi.fn(async () => { repaired = true; })
    } as any;

    const resolution = await resolveEmailSendCapability(service);
    expect(service.test).toHaveBeenCalledWith("google-1");
    expect(resolution.status).toBe("ready");
  });

  it("does not silently request a capability the user never selected", async () => {
    const account = {
      id: "google-1",
      provider: "google",
      capabilities: ["email.read", "email.modify"],
      requestedCapabilities: ["email.read", "email.modify"]
    } as any;
    const service = {
      resolveForCapability: vi.fn(() => ({ status: "missing_capability", account })),
      test: vi.fn()
    } as any;

    const resolution = await resolveEmailSendCapability(service);
    expect(service.test).not.toHaveBeenCalled();
    expect(resolution.status).toBe("missing_capability");
  });
});
