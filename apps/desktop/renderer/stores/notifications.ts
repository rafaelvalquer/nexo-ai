import { create } from "zustand";

export type NexoNotification = { id: string; title: string; detail: string; tone: "info" | "success" | "warning" | "error"; createdAt: string; read: boolean };
type NotificationStore = { items: NexoNotification[]; push: (item: Omit<NexoNotification, "id" | "createdAt" | "read">) => void; markAllRead: () => void };

export const useNotificationsStore = create<NotificationStore>(set => ({
  items: [],
  push: item => set(state => ({ items: [{ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false }, ...state.items].slice(0, 20) })),
  markAllRead: () => set(state => ({ items: state.items.map(item => ({ ...item, read: true })) }))
}));
