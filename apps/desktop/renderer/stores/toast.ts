import { create } from "zustand";

export type ToastItem = { id: string; title: string; description?: string; tone: "success" | "error" | "warning" | "info" };
type ToastStore = { items: ToastItem[]; show: (toast: Omit<ToastItem, "id">) => void; dismiss: (id: string) => void };

const dismissalTimers = new Map<string, () => void>();

function clearDismissalTimer(id: string) {
  const cancel = dismissalTimers.get(id);
  if (cancel) {
    cancel();
    dismissalTimers.delete(id);
  }
}

export const useToastStore = create<ToastStore>(set => ({
  items: [],
  show: toast => {
    const item = { ...toast, id: crypto.randomUUID() };
    set(state => {
      const items = [...state.items, item].slice(-4);
      const retainedIds = new Set(items.map(current => current.id));
      for (const id of dismissalTimers.keys()) {
        if (!retainedIds.has(id)) clearDismissalTimer(id);
      }
      return { items };
    });
    const timer = window.setTimeout(() => {
      dismissalTimers.delete(item.id);
      set(state => ({ items: state.items.filter(current => current.id !== item.id) }));
    }, 5000);
    dismissalTimers.set(item.id, () => window.clearTimeout(timer));
  },
  dismiss: id => {
    clearDismissalTimer(id);
    set(state => ({ items: state.items.filter(item => item.id !== id) }));
  }
}));
