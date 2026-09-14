import { Component, lazy, Suspense, useEffect, type ComponentType, type ErrorInfo, type ReactNode } from "react";
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
import { OllamaModelInstaller } from "./components/shell/OllamaModelInstaller";
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

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Falha ao renderizar a página", error, info.componentStack); }
  render() { if (this.state.error) return <section className="pageRenderError" role="alert"><h2>Não foi possível abrir esta tela</h2><p>{this.state.error.message}</p><button onClick={() => this.setState({ error: null })}>Tentar novamente</button></section>; return this.props.children; }
}

export function App() {
  const page = useAppStore(s => s.page);
  const syncAssistant = useAssistantStore(s => s.sync);
  const handleTaskEvent = useAssistantStore(s => s.handleTaskEvent);
  const Page = pages[page] ?? Today;

  useEffect(() => {
    void syncAssistant();
    const unsubscribe=window.nexo.onTaskEvent(handleTaskEvent);
    const unsubscribeResources=window.nexo.onChatResourceUpdated?.(event=>useAssistantStore.getState().handleResourceEvent(event));
    const timer = window.setInterval(() => void syncAssistant(), 5000);
    return () => {unsubscribe();unsubscribeResources?.();window.clearInterval(timer);};
  }, [syncAssistant, handleTaskEvent]);

  return <div className="app"><Sidebar /><main className={page === "Assistente" ? "assistantMain" : ""}><Topbar /><PageErrorBoundary><Suspense fallback={<div className="page">Carregando tela…</div>}><Page /></Suspense></PageErrorBoundary></main><CommandPalette /><Onboarding /><OllamaModelInstaller /></div>;
}
