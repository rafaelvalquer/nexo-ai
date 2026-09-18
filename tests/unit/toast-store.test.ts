import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../../apps/desktop/renderer/stores/toast";

describe("toast lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  });

  afterEach(() => {
    for (const item of useToastStore.getState().items) useToastStore.getState().dismiss(item.id);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps at most four visible toasts and clears the evicted toast timers", () => {
    for (let index = 1; index <= 5; index++) {
      useToastStore.getState().show({ title: `Toast ${index}`, tone: "info" });
    }

    expect(useToastStore.getState().items.map(item => item.title)).toEqual(["Toast 2", "Toast 3", "Toast 4", "Toast 5"]);
    expect(vi.getTimerCount()).toBe(4);
  });

  it("clears a toast timer when dismissed and expires an untouched toast after five seconds", () => {
    const store = useToastStore.getState();
    store.show({ title: "Dispensável", tone: "info" });
    const dismissed = useToastStore.getState().items[0];
    useToastStore.getState().dismiss(dismissed.id);
    expect(vi.getTimerCount()).toBe(0);

    useToastStore.getState().show({ title: "Temporário", tone: "success" });
    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().items.map(item => item.title)).toEqual(["Temporário"]);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().items).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
