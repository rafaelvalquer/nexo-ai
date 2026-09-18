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
import { motionTokens } from "./design/motion";
import { userFacingError } from "./utils/user-facing-error";
import { developerDiagnosticsEnabled } from "./hooks/useDeveloperDiagnostics";

const pages: Record<string, ComponentType> = {
  Dashboard: lazy(()=>import("./pages/Dashboard").then(module=>({default:module.Dashboard}))),
  Assistente: lazy(()=>import("./pages/Assistant").then(module=>({default:module.Assistant}))),
  Macros: lazy(()=>import("./pages/Automations").then(module=>({default:module.Automations}))),
  Escritório: lazy(()=>import("./pages/Office").then(module=>({default:module.Office}))),
  "Configurações": lazy(()=>import("./pages/Settings").then(module=>({default:module.Settings}))),
  Aprovações: lazy(()=>import("./pages/Approvals").then(module=>({default:module.Approvals}))),
  Documentos: lazy(()=>import("./pages/Documents").then(module=>({default:module.Documents}))),
  Atividade: lazy(()=>import("./pages/Activity").then(module=>({default:module.Activity}))),
  Memória: lazy(()=>import("./pages/Memory").then(module=>({default:module.Memory}))),
  Diagnóstico: lazy(()=>import("./pages/Diagnostics").then(module=>({default:module.Diagnostics}))),
  Ferramentas: lazy(()=>import("./pages/Tools").then(module=>({default:module.Tools}))),
  Conexões: lazy(()=>import("./pages/Connections").then(module=>({default:module.Connections})))
};

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Falha ao renderizar a página", error, info.componentStack); }
  render() { if (this.state.error) return <section className="pageRenderError" role="alert"><h2>Não foi possível abrir esta tela</h2><p>{userFacingError(this.state.error,"Ocorreu um problema ao abrir esta área. Tente novamente.",developerDiagnosticsEnabled())}</p><button onClick={() => this.setState({ error: null })}>Tentar novamente</button></section>; return this.props.children; }
}

export function App() {
  const page = useAppStore(s => s.page);
  const syncAssistant = useAssistantStore(s => s.sync);
  const handleTaskEvent = useAssistantStore(s => s.handleTaskEvent);
  const Page = pages[page] ?? pages.Assistente;
  useEffect(()=>{let active=true;const refresh=()=>void window.nexo.status().then(value=>{if(active)useAppStore.getState().setStatus(value);}).catch(()=>undefined);refresh();const timer=window.setInterval(refresh,30000);return()=>{active=false;window.clearInterval(timer);};},[]);

  useEffect(() => {
    void syncAssistant();
    const unsubscribe=window.nexo.onTaskEvent(event=>{handleTaskEvent(event);const value=event as any;const task=value?.task;if(value?.kind==="completed"||task?.status==="completed"){useNotificationsStore.getState().push({title:"Tarefa concluída",detail:task?.title??"O Nexo terminou a execução.",tone:"success"});}else if(value?.kind==="failed"||task?.status==="failed"){useNotificationsStore.getState().push({title:"Tarefa com erro",detail:userFacingError(task?.error,"Não foi possível concluir a tarefa. Abra o Assistente para revisar e tentar novamente.",developerDiagnosticsEnabled()),tone:"error"});}else if(task?.status==="waiting_approval"){useNotificationsStore.getState().push({title:"Aprovação necessária",detail:task?.title??"Uma ação aguarda sua confirmação.",tone:"warning"});}});
    const unsubscribeResources=window.nexo.onChatResourceUpdated?.(event=>useAssistantStore.getState().handleResourceEvent(event));
    const timer = window.setInterval(() => void syncAssistant(), 5000);
    return () => {unsubscribe();unsubscribeResources?.();window.clearInterval(timer);};
  }, [syncAssistant, handleTaskEvent]);

  const collapsed=useAppStore(s=>s.sidebarCollapsed); const reduceMotion=useReducedMotion();
  return <div className={`app${collapsed?" sidebarCollapsed":""}`}><a className="skipToContent" href="#page-content">Pular para o conteúdo da página</a><Sidebar /><main id="page-content" tabIndex={-1} className={page === "Assistente" ? "assistantMain" : ""}><Topbar /><AnimatePresence mode="wait" initial={false}><motion.div key={page} className={`pageMotion${page==="Assistente"?" assistantPageMotion":""}`} initial={reduceMotion?false:{opacity:0,y:motionTokens.distance.subtle}} animate={{opacity:1,y:0}} exit={reduceMotion?{opacity:0}:{opacity:0,y:-2}} transition={{duration:reduceMotion?0:motionTokens.duration.page/1000,ease:motionTokens.ease.out}}><PageErrorBoundary key={page}><Suspense fallback={<div className="pageLoading"><span className="loadingDot"/>Abrindo {page}…</div>}><Page /></Suspense></PageErrorBoundary></motion.div></AnimatePresence></main><CommandPalette /><Onboarding /><OllamaModelInstaller /><ToastViewport /></div>;
}
