import { Component, lazy, Suspense, useEffect, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./stores/app";
import { Topbar } from "./components/shell/Topbar";
import { CommandPalette } from "./components/shell/CommandPalette";
import { useAssistantStore } from "./stores/assistant";
import { Onboarding } from "./components/shell/Onboarding";
import { OllamaModelInstaller } from "./components/shell/OllamaModelInstaller";
import { ToastViewport } from "./components/shell/ToastViewport";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNotificationsStore } from "./stores/notifications";

const pages: Record<string, ComponentType> = {
  Assistente: lazy(()=>import("./pages/Assistant").then(module=>({default:module.Assistant}))),
  Macros: lazy(()=>import("./pages/Automations").then(module=>({default:module.Automations}))),
  Escritório: lazy(()=>import("./pages/Office").then(module=>({default:module.Office}))),
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
  useEffect(()=>{let active=true;const refresh=()=>void window.nexo.status().then(value=>{if(active)useAppStore.getState().setStatus(value);}).catch(()=>undefined);refresh();const timer=window.setInterval(refresh,30000);return()=>{active=false;window.clearInterval(timer);};},[]);

  useEffect(() => {
    void syncAssistant();
    const unsubscribe=window.nexo.onTaskEvent(event=>{handleTaskEvent(event);const value=event as any;const task=value?.task;if(value?.kind==="completed"||task?.status==="completed"){useNotificationsStore.getState().push({title:"Tarefa concluída",detail:task?.title??"O Nexo terminou a execução.",tone:"success"});}else if(value?.kind==="failed"||task?.status==="failed"){useNotificationsStore.getState().push({title:"Tarefa com erro",detail:task?.error?.message??task?.error??"Revise os detalhes da execução.",tone:"error"});}else if(task?.status==="waiting_approval"){useNotificationsStore.getState().push({title:"Aprovação necessária",detail:task?.title??"Uma ação aguarda sua confirmação.",tone:"warning"});}});
    const unsubscribeResources=window.nexo.onChatResourceUpdated?.(event=>useAssistantStore.getState().handleResourceEvent(event));
    const timer = window.setInterval(() => void syncAssistant(), 5000);
    return () => {unsubscribe();unsubscribeResources?.();window.clearInterval(timer);};
  }, [syncAssistant, handleTaskEvent]);

  const collapsed=useAppStore(s=>s.sidebarCollapsed); const reduceMotion=useReducedMotion();
  return <div className={`app${collapsed?" sidebarCollapsed":""}`}><Sidebar /><main className={page === "Assistente" ? "assistantMain" : ""}><Topbar /><AnimatePresence mode="wait" initial={false}><motion.div key={page} className={`pageMotion${page==="Assistente"?" assistantPageMotion":""}`} initial={reduceMotion?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={reduceMotion?{opacity:0}:{opacity:0,y:-2}} transition={{duration:reduceMotion?0:.18}}><PageErrorBoundary key={page}><Suspense fallback={<div className="pageLoading"><span className="loadingDot"/>Abrindo {page}…</div>}><Page /></Suspense></PageErrorBoundary></motion.div></AnimatePresence></main><CommandPalette /><Onboarding /><OllamaModelInstaller /><ToastViewport /></div>;
}
