import { Home, MessageSquare, Zap, ShieldCheck, Plug, History, Brain, Settings, FileText, Gauge, Building2 } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";

const items = [
  ["Hoje", Home],
  ["Assistente", MessageSquare],
  ["Escritório", Building2],
  ["Automações", Zap],
  ["Aprovações", ShieldCheck],
  ["Conexões", Plug],
  ["Documentos", FileText],
  ["Atividade", History],
  ["Memória", Brain],
  ["Configurações", Settings],
  ["Diagnóstico", Gauge]
] as const;

export function Sidebar() {
  const page = useAppStore(s => s.page);
  const setPage = useAppStore(s => s.setPage);
  const assistantBusy = useAssistantStore(s => s.sessions.some(session => session.status === "running" || session.status === "waiting_approval"));

  return (
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">N</div><div><b>NEXO</b><span>AI LOCAL</span></div></div>
      <nav>
        {items.map(([name, Icon]) => (
          <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)}>
            <Icon size={18} />
            <span>{name}</span>
            {name === "Assistente" && assistantBusy && <span className="navBusy" title="Tarefa em execução" />}
          </button>
        ))}
      </nav>
      <div className="sidebarFoot"><span className="dot" /> Core local ativo</div>
    </aside>
  );
}
