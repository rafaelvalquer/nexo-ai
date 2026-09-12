import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./stores/app";
import { Today } from "./pages/Today";
import { Assistant } from "./pages/Assistant";
import { Automations } from "./pages/Automations";
import { Approvals } from "./pages/Approvals";
import { Connections } from "./pages/Connections";
import { Activity } from "./pages/Activity";
import { Memory } from "./pages/Memory";
import { Settings } from "./pages/Settings";
import { Documents } from "./pages/Documents";
import { Topbar } from "./components/shell/Topbar";
import { CommandPalette } from "./components/shell/CommandPalette";
import { useAssistantStore } from "./stores/assistant";
import { Onboarding } from "./components/shell/Onboarding";
import { Diagnostics } from "./pages/Diagnostics";
const Office=lazy(()=>import("./pages/Office").then(module=>({default:module.Office})));

const pages: Record<string, ComponentType> = {
  Hoje: Today,
  Assistente: Assistant,
  "Automações": Automations,
  Aprovações: Approvals,
  "Conexões": Connections,
  Documentos: Documents,
  Atividade: Activity,
  "Memória": Memory,
  "Configurações": Settings,
  "Diagnóstico": Diagnostics,
  "Escritório": Office
};

export function App() {
  const page = useAppStore(s => s.page);
  const syncAssistant = useAssistantStore(s => s.sync);
  const assistantBusy = useAssistantStore(s => s.isStreaming);
  const Page = pages[page] ?? Today;

  useEffect(() => {
    void syncAssistant();
    const interval = assistantBusy ? 250 : 1200;
    const timer = window.setInterval(() => void syncAssistant(), interval);
    return () => window.clearInterval(timer);
  }, [syncAssistant, assistantBusy]);

  return <div className="app"><Sidebar /><main className={page === "Assistente" ? "assistantMain" : ""}><Topbar /><Suspense fallback={<div className="page">Carregando Pixel Office…</div>}><Page /></Suspense></main><CommandPalette /><Onboarding /></div>;
}
