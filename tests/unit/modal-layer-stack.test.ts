import { describe, expect, it, vi } from "vitest";
import { ModalLayerStack } from "../../apps/desktop/renderer/components/ui/focus-trap";

describe("ModalLayerStack", () => {
  it("sends Escape only to the top layer and restores the underlying layer", () => {
    const stack = new ModalLayerStack();
    const closeDrawer = vi.fn();
    const closeDialog = vi.fn();
    const removeDrawer = stack.push({ panel: {} as HTMLElement, onClose: closeDrawer });
    const removeDialog = stack.push({ panel: {} as HTMLElement, onClose: closeDialog });
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;

    expect(stack.handleEscape(event)).toBe(true);
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeDrawer).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(removeDialog()).toBe(true);

    stack.handleEscape(event);
    expect(closeDrawer).toHaveBeenCalledOnce();
    expect(removeDrawer()).toBe(true);
    expect(stack.size).toBe(0);
  });

  it("does not move focus ownership when a non-top layer is removed", () => {
    const stack = new ModalLayerStack();
    const removeBackground = stack.push({ panel: {} as HTMLElement, onClose: vi.fn() });
    const active = { panel: {} as HTMLElement, onClose: vi.fn() };
    const removeActive = stack.push(active);

    expect(removeBackground()).toBe(false);
    expect(stack.top).toBe(active);
    expect(removeActive()).toBe(true);
    expect(stack.top).toBeUndefined();
  });
});
