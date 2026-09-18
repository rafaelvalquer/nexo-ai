const FOCUSABLE_SELECTOR = "a[href],button,input,select,textarea,[tabindex],[contenteditable='true']";

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(element => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
}

export function trapTabKey(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export type ModalLayer = { panel: HTMLElement; onClose: () => void };

export class ModalLayerStack {
  private readonly layers: ModalLayer[] = [];

  get top(): ModalLayer | undefined {
    return this.layers.at(-1);
  }

  get size(): number {
    return this.layers.length;
  }

  push(layer: ModalLayer): () => boolean {
    this.layers.push(layer);
    return () => {
      const index = this.layers.indexOf(layer);
      if (index < 0) return false;
      const wasTop = index === this.layers.length - 1;
      this.layers.splice(index, 1);
      return wasTop;
    };
  }

  handleEscape(event: KeyboardEvent): boolean {
    const active = this.top;
    if (event.key !== "Escape" || !active) return false;
    event.preventDefault();
    event.stopPropagation();
    active.onClose();
    return true;
  }
}

export const modalLayerStack = new ModalLayerStack();

function onModalKeyDown(event: KeyboardEvent) {
  if (modalLayerStack.handleEscape(event)) return;
  const active = modalLayerStack.top;
  if (active) trapTabKey(active.panel, event);
}

let previousBodyOverflow: string | null = null;

export function registerModalLayer(panel: HTMLElement, onClose: () => void): () => boolean {
  const layer = { panel, onClose };
  const wasEmpty = modalLayerStack.size === 0;
  const unregister = modalLayerStack.push(layer);
  if (wasEmpty) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onModalKeyDown);
  }

  return () => {
    const wasTop = unregister();
    if (modalLayerStack.size === 0) {
      document.removeEventListener("keydown", onModalKeyDown);
      if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    }
    return wasTop;
  };
}
