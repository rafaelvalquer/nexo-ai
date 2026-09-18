import { MessageSquare, Zap, Settings, PanelLeftClose, PanelLeftOpen, Building2, LayoutDashboard } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../design/motion";
import { Tooltip } from "./ui/Tooltip";

const items = [
  ["Dashboard", "Dashboard", LayoutDashboard],
  ["Assistente", "Assistente", MessageSquare],
  ["Macros", "Macros", Zap],
  ["Escritório", "Escritório", Building2],
  ["Configurações", "Configurações", Settings]
] as const;

export function Sidebar() {
  const page = useAppStore(s => s.page);
  const status = useAppStore(s => s.status) as { llm?: { ok?: boolean } } | null;
  const setPage = useAppStore(s => s.setPage);
  const assistantBusy = useAssistantStore(s => s.sessions.some(session => session.status === "running" || session.status === "waiting_approval"));
  const collapsed=useAppStore(s=>s.sidebarCollapsed),setCollapsed=useAppStore(s=>s.setSidebarCollapsed);
  const reduceMotion=useReducedMotion();

  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><div className="brandMark" aria-hidden="true"><span>N</span><i/></div><div className="brandWordmark"><b>NEXO</b><span>AI LOCAL</span></div><Tooltip className="sidebarToggleTooltip" content={collapsed?"Expandir menu":"Recolher menu"}><button type="button" className="sidebarToggle" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?"Expandir menu":"Recolher menu"}>{collapsed?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>}</button></Tooltip></div>
      <nav aria-label="Principal">
        {items.map(([label, route, Icon]) => (
          <button key={label} className={page === route ? "active" : ""} onClick={() => setPage(route)} title={label} aria-label={label} data-label={label} aria-current={page===route?"page":undefined}>
            {page===route&&<motion.span className="navActiveIndicator" layoutId="active-navigation" aria-hidden="true" transition={reduceMotion?{duration:0}:motionTokens.spring.navigation}/>}
            <Icon size={18} />
            <span className="navLabel">{label}</span>
            {route === "Assistente" && assistantBusy && <span className="navBusy" title="Tarefa em execução" />}
          </button>
        ))}
      </nav>
      <div className={`sidebarFoot ${status?.llm?.ok?"online":status?"offline":"checking"}`} title={status?.llm?.ok?"IA local conectada":status?"IA local desconectada":"Verificando conexão da IA local"} role="status" aria-live="polite"><span className="dot" /><span>{status?.llm?.ok?"IA local conectada":status?"IA local desconectada":"Verificando IA local…"}</span></div>
    </aside>
  );
}
