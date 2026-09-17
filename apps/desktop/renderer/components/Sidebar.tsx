import { MessageSquare, Zap, Settings, PanelLeftClose, PanelLeftOpen, Building2 } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../design/motion";

const items = [
  ["Assistente", "Assistente", MessageSquare],
  ["Macros", "Macros", Zap],
  ["Escritório", "Escritório", Building2],
  ["Configurações", "Configurações", Settings]
] as const;

export function Sidebar() {
  const page = useAppStore(s => s.page);
  const setPage = useAppStore(s => s.setPage);
  const assistantBusy = useAssistantStore(s => s.sessions.some(session => session.status === "running" || session.status === "waiting_approval"));
  const collapsed=useAppStore(s=>s.sidebarCollapsed),setCollapsed=useAppStore(s=>s.setSidebarCollapsed);
  const reduceMotion=useReducedMotion();

  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="brand"><div className="brandMark" aria-hidden="true"><span>N</span><i/></div><div className="brandWordmark"><b>NEXO</b><span>AI LOCAL</span></div><button className="sidebarToggle" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?"Expandir menu":"Recolher menu"} title={collapsed?"Expandir menu":"Recolher menu"}>{collapsed?<PanelLeftOpen size={16}/>:<PanelLeftClose size={16}/>}</button></div>
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
      <div className="sidebarFoot" title={collapsed?"IA local pronta":"IA local pronta"}><span className="dot" /><span>IA local pronta</span></div>
    </aside>
  );
}
