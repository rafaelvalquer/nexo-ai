import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

describe("standard tool result contract", () => {
  it("normalizes legacy tool outputs to success and structured error fields", async () => {
    const registry = new ToolRegistry().register(
      { name: "contract_read_ok", description: "read", risk: "READ", permissions: [], inputSchema: z.object({}), execute: async () => ({ ok: true, summary: "Loaded", data: { count: 1 } }) },
      { name: "contract_read_error", description: "read", risk: "READ", permissions: [], inputSchema: z.object({}), execute: async () => ({ ok: false, summary: "Missing", error: "ITEM_NOT_FOUND" }) },
    );
    const executor = new ActionExecutor(registry, new PermissionEngine(() => ({ allowedRoots: [], autonomy: "balanced" } as any)), { record() {} } as any);
    const okAction = await executor.preflight("contract_read_ok", {});
    const failedAction = await executor.preflight("contract_read_error", {});
    if (!okAction.ok || !failedAction.ok) throw new Error("Test tools should pass preflight.");
    const ok = await executor.executePrepared(okAction.action);
    const failed = await executor.executePrepared(failedAction.action);
    expect(ok.result).toMatchObject({ success: true, ok: true, data: { count: 1 } });
    expect(failed.result).toMatchObject({ success: false, ok: false, error: { code: "ITEM_NOT_FOUND", message: "ITEM_NOT_FOUND" } });
  });
});
