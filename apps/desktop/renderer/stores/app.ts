import { create } from "zustand";

type Store = {
  page: string;
  setPage: (p: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  status: unknown;
  setStatus: (s: unknown) => void;
};

const canonicalPage = (page: string) => ({
  Hoje: "Dashboard", "Automações": "Macros", "Pixel Office": "Escritório"
}[page] ?? page);

const savedSidebarCollapsed = typeof localStorage !== "undefined" && localStorage.getItem("nexo.sidebar.collapsed") === "true";
export const useAppStore = create<Store>((set) => ({
  page: "Dashboard",
  setPage: page => set({ page: canonicalPage(page) }),
  sidebarCollapsed: savedSidebarCollapsed,
  setSidebarCollapsed: sidebarCollapsed => { if(typeof localStorage!=="undefined")localStorage.setItem("nexo.sidebar.collapsed",String(sidebarCollapsed));set({sidebarCollapsed}); },
  status: null,
  setStatus: status => set({ status })
}));
