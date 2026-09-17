import { describe, it, expect } from "vitest";
import path from "node:path";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { SecurityPolicyService } from "../../packages/core/src/security/policy.js";

const settings = (overrides: Partial<ReturnType<typeof baseSettings>> = {}) => ({ ...baseSettings(), ...overrides });
const baseSettings = () => ({
  model: "x",
  ollamaUrl: "http://localhost",
  autonomy: "balanced" as const,
  allowedRoots: [] as string[],
  privateMode: false,
  runInBackground: true,
  memoryEnabled: true,
  memoryAskBeforeSave: true
});

describe("PermissionEngine", () => {
  it("permite apenas subcaminhos autorizados", () => {
    const root = path.resolve("/tmp/nexo-safe");
    const p = new PermissionEngine(() => settings({ allowedRoots: [root] }));
    expect(p.isPathAllowed(path.join(root, "a.txt"))).toBe(true);
    expect(p.isPathAllowed(path.resolve("/tmp/other/a.txt"))).toBe(false);
  });

  it("balanced não pede aprovação para SAFE_WRITE", () => {
    const p = new PermissionEngine(() => settings());
    expect(p.requiresApproval("SAFE_WRITE")).toBe(false);
    expect(p.requiresApproval("CRITICAL")).toBe(true);
  });

  it("pede confirmação para memória inferida quando configurado", () => {
    const p = new PermissionEngine(() => settings({ memoryAskBeforeSave: true }));
    expect(p.requiresAutomaticMemoryApproval()).toBe(true);
  });

  it("desativa memória durante modo privado", () => {
    const p = new PermissionEngine(() => settings({ privateMode: true }));
    expect(p.isMemoryEnabled()).toBe(false);
  });
});

describe("SecurityPolicyService", () => {
  const policy = new SecurityPolicyService(() => ({ ...baseSettings(), connectionsEnabled:true, browserAutomationEnabled:false, fileWritesEnabled:false, requireApprovalForEmail:true, allowedDomains:["empresa.com"] } as any));
  it("blocks disabled browser and file-writing tools", () => {
    expect(() => policy.assertToolEnabled("browser_navigate")).toThrow(/navegador/);
    expect(() => policy.assertToolEnabled("write_file")).toThrow(/arquivos/);
    expect(() => policy.assertToolEnabled("document_create")).toThrow(/arquivos/);
  });
  it("enforces approved recipient domains and e-mail approval", () => {
    expect(() => policy.assertRecipientDomains([{email:"person@external.com"}])).toThrow(/domínio/);
    expect(policy.requiresApproval("email_send", "SENSITIVE")).toBe(true);
  });
});
