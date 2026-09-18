import { describe, expect, it } from "vitest";
import { SecurityPolicyService } from "../../packages/core/src/security/policy.js";

describe("filesystem creation approval policy", () => {
  it("always requires confirmation for file and folder creation without changing other WRITE tools", () => {
    const settings = {
      requireApprovalForEmail: false,
      connectionsEnabled: true,
      browserAutomationEnabled: true,
      webToolsEnabled: true,
      filesystemToolsEnabled: true,
      systemToolsEnabled: true,
      fileWritesEnabled: true,
      allowedDomains: []
    } as any;
    const policy = new SecurityPolicyService(() => settings);

    expect(policy.requiresApproval("create_text_file", "WRITE")).toBe(true);
    expect(policy.requiresApproval("create_folder", "WRITE")).toBe(true);
    expect(policy.requiresApproval("copy_file", "WRITE")).toBe(false);
    expect(policy.requiresApproval("move_file", "WRITE")).toBe(false);
    expect(policy.requiresApproval("rename_file", "WRITE")).toBe(false);
  });
});
