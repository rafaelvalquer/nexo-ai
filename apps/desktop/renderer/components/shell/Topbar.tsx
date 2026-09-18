import { useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, Bell, CheckCircle2, ChevronDown, Command, Info, Search, Settings2 } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useVisualStore } from "../../stores/visual";
import { useAssistantStore } from "../../stores/assistant";
import { useNotificationsStore } from "../../stores/notifications";
import { NexoDrawer } from "../ui/NexoDrawer";

const labels: Record<string, string> = { Dashboard: "Centro de comando do Nexo", Assistente: "Seu espaço de trabalho", Macros: "Rotinas que trabalham por você", Escritório: "Veja o Nexo em ação", Ferramentas: "Recursos disponíveis", Configurações: "Seu Nexo, do seu jeito" };

export function Topbar() {
  const page = useAppStore(state => state.page);
  const status = useAppStore(state => state.status) as any;
  const visual = useVisualStore();
  const tasks = useAssistantStore(state => state.tasks);
  const active = tasks.filter(item => item.status === "queued" || item.status === "running" || item.status === "waiting_approval" || item.status === "waiting_review");
  const notifications = useNotificationsStore(state => state.items);
  const markAllRead = useNotificationsStore(state => state.markAllRead);
  const unread = notifications.filter(item => !item.read).length;
  const [statusOpen, setStatusOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!statusRef.current?.contains(event.target as Node)) setStatusOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const openPalette = () => window.dispatchEvent(new Event("nexo:open-command-palette"));
  const openExecution = async (conversationId?:string) => {
    if(!conversationId)return;
    const assistant=useAssistantStore.getState();
    await assistant.sync();
    useAssistantStore.getState().selectSession(conversationId);
    useAppStore.getState().setPage("Assistente");
    setNotificationsOpen(false);
  };
  const toggleNotifications = () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    setStatusOpen(false);
    if (next) markAllRead();
  };
  const title = (labels[page] ?? visual.label) || "Espaço de trabalho";
  const badgeCount = unread;
  return <header className="topbar">
    <div className="topbarPage"><span className="topbarEyebrow">NEXO <i>/</i> {page}</span><strong>{title}</strong></div>
    <button className="topbarSearch" onClick={openPalette} aria-label="Abrir busca e comandos"><Search size={15}/><span>Buscar comandos e conversas…</span><kbd><Command size={11}/> K</kbd></button>
    <div className="topbarActions">
      {active.length>0&&<button className="activeExecutionButton" onClick={toggleNotifications} aria-label={`${active.length} ${active.length===1?"execução ativa":"execuções ativas"}`}><Activity size={14}/><span>{active.length} {active.length===1?"execução":"execuções"}</span></button>}
      <div className="topbarPopoverAnchor" ref={statusRef}>
        <button className={`localStatus ${status?.llm?.ok ? "online" : status ? "offline" : "checking"}`} onClick={() => { setStatusOpen(value => !value); setNotificationsOpen(false); }} aria-expanded={statusOpen} aria-label="Estado da IA local"><span className="statusLight"/><span>IA local</span><ChevronDown size={13}/></button>
        {statusOpen && <div className="topbarPopover"><div className="popoverStatus"><span className="statusLight"/><div><b>{status ? status.llm?.ok ? "Ollama conectado" : "Ollama desconectado" : "Verificando conexão…"}</b><small>{status?.settings?.ollamaUrl ?? "http://localhost:11434"}</small></div></div><div className="popoverLine"><span>Modelo</span><b>{status?.settings?.model ?? "Verificando…"}</b></div><small>As conversas e os dados permanecem neste dispositivo.</small><button className="configureAiButton" onClick={()=>{setStatusOpen(false);useAppStore.getState().setPage("Configurações");}}><Settings2 size={14}/> Configurar IA</button></div>}
      </div>
      <button className={`topbarIconButton ${badgeCount ? "hasActivity" : ""}`} onClick={toggleNotifications} aria-label={badgeCount ? `${badgeCount} notificações não lidas` : "Notificações"} title="Execuções e notificações" aria-expanded={notificationsOpen}><Bell size={16}/>{badgeCount > 0 && <i>{badgeCount}</i>}</button>
    </div>
    <NexoDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} eyebrow="ATIVIDADE LOCAL" title="Notificações" className="notificationCenterDrawer">
      <div className="notificationCenter" aria-live="polite">
        {active.length > 0 && <section className="activeNotifications"><small>EM ANDAMENTO</small>{active.map(item => <button type="button" className="notificationItem notificationTask" key={item.id} onClick={() => void openExecution(item.conversationId)} disabled={!item.conversationId} aria-label={`Abrir tarefa: ${typeof item.input.text === "string" ? item.input.text.slice(0, 80) : item.type}`}><Activity size={14}/><span><b>{typeof item.input.text === "string" ? item.input.text.slice(0, 80) : item.type}</b><small>{item.status === "waiting_approval" ? "Aguardando sua confirmação" : item.status === "waiting_review" ? "Aguardando sua revisão" : item.statusMessage || "Executando agora"}</small></span></button>)}</section>}
        {notifications.length > 0 ? <section className="recentNotifications"><small>RECENTES</small>{notifications.slice(0, 12).map(item => { const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? AlertCircle : item.tone === "warning" ? AlertTriangle : Info; return <article className={`notificationItem ${item.tone}`} key={item.id}><Icon size={14}/><span><b>{item.title}</b><small>{item.detail}</small><small>{new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span></article>; })}</section> : !active.length && <p className="notificationEmpty">Nenhuma notificação por enquanto.</p>}
      </div>
    </NexoDrawer>
  </header>;
}
