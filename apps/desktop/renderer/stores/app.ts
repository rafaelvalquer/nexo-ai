import { create } from "zustand";

type Store = {
  page: string;
  setPage: (p: string) => void;
  status: unknown;
  setStatus: (s: unknown) => void;
};

export const useAppStore = create<Store>(set => ({
  page: import.meta.env.DEV && !window.nexo ? "Assistente" : "Hoje",
  setPage: page => set({ page }),
  status: null,
  setStatus: status => set({ status })
}));
