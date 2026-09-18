import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => unknown>());
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) => handlers.set(channel, handler)
  }
}));

import { registerMacroIpc } from "../../apps/desktop/electron/ipc/macros.js";

describe("Macro IPC surface", () => {
  beforeEach(() => handlers.clear());

  it("registers canonical macro channels and delegates reads and runs", async () => {
    const macros = {
      list: vi.fn(() => [{ id: "macro-1", name: "Resumo" }]),
      runManual: vi.fn(async (id: string) => ({ id, status: "running" }))
    };
    registerMacroIpc({ macros, draftMacro: vi.fn() } as any);

    expect(await handlers.get("nexo:macro:list")?.({})).toEqual([{ id: "macro-1", name: "Resumo" }]);
    expect(await handlers.get("nexo:macro:run")?.({}, "macro-1")).toEqual({ id: "macro-1", status: "running" });
    expect(macros.runManual).toHaveBeenCalledWith("macro-1");
    expect([...handlers.keys()].every(channel => channel.startsWith("nexo:macro:"))).toBe(true);
  });

  it("rejects malformed identifiers before dispatching mutations", () => {
    const remove = vi.fn();
    registerMacroIpc({ macros: { remove }, draftMacro: vi.fn() } as any);

    expect(() => handlers.get("nexo:macro:remove")?.({}, { id: "macro-1" })).toThrow("ID da macro inválido");
    expect(remove).not.toHaveBeenCalled();
  });
});
