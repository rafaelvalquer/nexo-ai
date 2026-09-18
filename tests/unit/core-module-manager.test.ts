import { describe, expect, it, vi } from "vitest";
import { CoreModuleManager } from "../../packages/core/src/modules/module-manager.js";
import type { CoreModule } from "../../packages/core/src/modules/module.js";

function module(id: string, calls: string[], dependencies?: string[]): CoreModule {
  return { id, dependencies, start: async () => { calls.push(`start:${id}`); }, stop: async () => { calls.push(`stop:${id}`); } };
}

describe("CoreModuleManager", () => {
  it("starts dependencies once and stops dependents before dependencies", async () => {
    const manager = new CoreModuleManager(), calls: string[] = [];
    manager.register(module("documents", calls));
    manager.register(module("rag", calls, ["documents"]));
    await Promise.all([manager.ensure("rag"), manager.ensure("rag")]);
    expect(calls).toEqual(["start:documents", "start:rag"]);
    expect(manager.snapshot().map(item => item.status)).toEqual(["ready", "ready"]);
    await manager.disable("documents");
    expect(calls).toEqual(["start:documents", "start:rag", "stop:rag", "stop:documents"]);
  });

  it("records start failures and rejects dependency cycles", async () => {
    const manager = new CoreModuleManager();
    const failed = { ...module("failed", []), start: vi.fn(async () => { throw new Error("offline"); }) };
    manager.register(failed);
    await expect(manager.enable("failed")).rejects.toThrow("offline");
    expect(manager.status("failed")).toBe("error");
    expect(manager.snapshot()[0]).toMatchObject({ status: "error", error: "offline" });

    manager.register(module("a", [], ["b"]));
    manager.register(module("b", [], ["a"]));
    await expect(manager.enable("a")).rejects.toThrow(/circular/i);
  });

  it("serializes disable against a dependent module that is still starting", async () => {
    const manager = new CoreModuleManager(), calls: string[] = [];
    let signalStarted!: () => void, releaseStart!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const release = new Promise<void>(resolve => { releaseStart = resolve; });
    manager.register({ id: "documents", start: async () => { calls.push("start:documents"); }, stop: async () => { calls.push("stop:documents"); } });
    manager.register({ id: "rag", dependencies: ["documents"], start: async () => { calls.push("start:rag"); signalStarted(); await release; }, stop: async () => { calls.push("stop:rag"); } });

    const enabling = manager.enable("rag");
    await started;
    const disabling = manager.disable("documents");
    releaseStart();
    await Promise.all([enabling, disabling]);

    expect(calls).toEqual(["start:documents", "start:rag", "stop:rag", "stop:documents"]);
    expect(manager.snapshot().map(item => item.status)).toEqual(["disabled", "disabled"]);
  });
});
