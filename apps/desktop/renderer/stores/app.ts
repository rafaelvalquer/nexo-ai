import { create } from "zustand";

type Store = {
  page: string;
  setPage: (p: string) => void;
  status: unknown;
  setStatus: (s: unknown) => void;
};

const canonicalPage = (page: string) => ({
  Hoje: "Assistente", "Automações": "Macros", Atividade: "Macros",
  Aprovações: "Assistente", Conexões: "Configurações", Memória: "Configurações",
  Documentos: "Assistente", Diagnóstico: "Configurações", Escritório: "Assistente"
}[page] ?? page);

export const useAppStore = create<Store>(set => ({
  page: "Assistente",
  setPage: page => set({ page: canonicalPage(page) }),
  status: null,
  setStatus: status => set({ status })
}));
