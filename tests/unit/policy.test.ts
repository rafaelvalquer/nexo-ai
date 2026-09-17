import { describe, it, expect } from "vitest";
import path from "node:path";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { SecurityPolicyService } from "../../packages/core/src/security/policy.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { CapabilityAwareToolCatalog } from "../../packages/core/src/agent/orchestrator/tool-catalog.js";

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

  it("usa READ, WRITE e CRITICAL para decidir aprovações", () => {
    const balanced = new PermissionEngine(() => settings());
    const cautious = new PermissionEngine(() => settings({ autonomy:"cautious" }));
    expect(balanced.requiresApproval("READ")).toBe(false);
    expect(balanced.requiresApproval("WRITE",true)).toBe(false);
    expect(cautious.requiresApproval("WRITE",true)).toBe(true);
    expect(balanced.requiresApproval("CRITICAL",true)).toBe(true);
    expect(balanced.requiresApproval("READ",true)).toBe(true);
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
    expect(() => policy.assertToolEnabled("browser_download")).toThrow(/navegador/);
    expect(() => policy.assertToolEnabled("write_file")).toThrow(/arquivos/);
    expect(() => policy.assertToolEnabled("document_create")).toThrow(/arquivos/);
  });
  it("enforces approved recipient domains and e-mail approval", () => {
    expect(() => policy.assertRecipientDomains([{email:"person@external.com"}])).toThrow(/domínio/);
    expect(policy.requiresApproval("email_send", "CRITICAL")).toBe(true);
  });
  it("blocks tool domains disabled in settings",()=>{
    const disabled=new SecurityPolicyService(()=>({...baseSettings(),webToolsEnabled:false,filesystemToolsEnabled:false,systemToolsEnabled:false} as any));
    expect(()=>disabled.assertToolEnabled("web_search")).toThrow(/web/);
    expect(()=>disabled.assertToolEnabled("list_files")).toThrow(/arquivos/);
    expect(()=>disabled.assertToolEnabled("system_info")).toThrow(/sistema/);
    const catalog=new CapabilityAwareToolCatalog(new ToolRegistry(),undefined,name=>disabled.isToolEnabled(name));
    expect(catalog.list().map(tool=>tool.name)).not.toEqual(expect.arrayContaining(["web_search","list_files","system_info"]));
  });
});
