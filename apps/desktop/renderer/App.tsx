import { useEffect, type ComponentType } from "react";
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

const pages: Record<string, ComponentType> = {
  Hoje: Today,
  Assistente: Assistant,
  "Automações": Automations,
  Aprovações: Approvals,
  "Conexões": Connections,
  Atividade: Activity,
  "Memória": Memory,
  "Configurações": Settings
};

export function App() {
  const page = useAppStore(s => s.page);
  const syncAssistant = useAppStore(s => s.syncAssistant);
  const assistantBusy = useAppStore(s => s.assistantBusy);
  const Page = pages[page] ?? Today;

  useEffect(() => {
    void syncAssistant();
    const interval = assistantBusy ? 250 : 1200;
    const timer = window.setInterval(() => void syncAssistant(), interval);
    return () => window.clearInterval(timer);
  }, [syncAssistant, assistantBusy]);

  return <div className="app"><Sidebar /><main><Page /></main></div>;
}
