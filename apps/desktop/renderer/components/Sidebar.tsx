import { MessageSquare, Zap, Settings, Wrench } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";

const items = [
  ["Assistente", "Assistente", MessageSquare],
  ["Macros", "Macros", Zap],
  ["Ferramentas", "Ferramentas", Wrench],
  ["Configurações", "Configurações", Settings]
] as const;

export function Sidebar() {
  const page = useAppStore(s => s.page);
  const setPage = useAppStore(s => s.setPage);
  const assistantBusy = useAssistantStore(s => s.sessions.some(session => session.status === "running" || session.status === "waiting_approval"));

  return (
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">N</div><div><b>NEXO</b><span>AI LOCAL</span></div></div>
      <nav>
        {items.map(([label, route, Icon]) => (
          <button key={label} className={page === route ? "active" : ""} onClick={() => setPage(route)}>
            <Icon size={18} />
            <span>{label}</span>
            {route === "Assistente" && assistantBusy && <span className="navBusy" title="Tarefa em execução" />}
          </button>
        ))}
      </nav>
      <div className="sidebarFoot"><span className="dot" /> Core local ativo</div>
    </aside>
  );
}
