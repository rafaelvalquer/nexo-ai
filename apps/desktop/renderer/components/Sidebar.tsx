import { Home, MessageSquare, Zap, ShieldCheck, Plug, History, Brain, Settings } from "lucide-react";
import { useAppStore } from "../stores/app";

const items = [
  ["Hoje", Home],
  ["Assistente", MessageSquare],
  ["Automações", Zap],
  ["Aprovações", ShieldCheck],
  ["Conexões", Plug],
  ["Atividade", History],
  ["Memória", Brain],
  ["Configurações", Settings]
] as const;

export function Sidebar() {
  const page = useAppStore(s => s.page);
  const setPage = useAppStore(s => s.setPage);
  const assistantBusy = useAppStore(s => s.assistantBusy);

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
