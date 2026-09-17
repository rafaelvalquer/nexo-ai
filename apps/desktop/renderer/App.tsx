import { Component, lazy, Suspense, useEffect, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./stores/app";
import { Topbar } from "./components/shell/Topbar";
import { CommandPalette } from "./components/shell/CommandPalette";
import { useAssistantStore } from "./stores/assistant";
import { Onboarding } from "./components/shell/Onboarding";
import { OllamaModelInstaller } from "./components/shell/OllamaModelInstaller";

const pages: Record<string, ComponentType> = {
  Assistente: lazy(()=>import("./pages/Assistant").then(module=>({default:module.Assistant}))),
  Macros: lazy(()=>import("./pages/Automations").then(module=>({default:module.Automations}))),
  Ferramentas: lazy(()=>import("./pages/Tools").then(module=>({default:module.Tools}))),
  "Configurações": lazy(()=>import("./pages/Settings").then(module=>({default:module.Settings})))
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
  const Page = pages[page] ?? pages.Assistente;

  useEffect(() => {
    void syncAssistant();
    const unsubscribe=window.nexo.onTaskEvent(handleTaskEvent);
    const unsubscribeResources=window.nexo.onChatResourceUpdated?.(event=>useAssistantStore.getState().handleResourceEvent(event));
    const timer = window.setInterval(() => void syncAssistant(), 5000);
    return () => {unsubscribe();unsubscribeResources?.();window.clearInterval(timer);};
  }, [syncAssistant, handleTaskEvent]);

  return <div className="app"><Sidebar /><main className={page === "Assistente" ? "assistantMain" : ""}><Topbar /><PageErrorBoundary key={page}><Suspense fallback={<div className="page">Carregando tela…</div>}><Page /></Suspense></PageErrorBoundary></main><CommandPalette /><Onboarding /><OllamaModelInstaller /></div>;
}
