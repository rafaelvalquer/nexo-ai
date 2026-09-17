import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Globe2, Monitor, Search, ShieldCheck, Wrench } from "lucide-react";
import { useAppStore } from "../stores/app";

type ToolRow = { name: string; description: string; risk: string; permissions?: string[]; domain?: string; mutatesState?: boolean; enabled?:boolean };
const groups: Record<string, { label: string; icon: typeof Wrench }> = {
  filesystem: { label: "Arquivos", icon: FolderOpen }, system: { label: "Sistema", icon: Monitor },
  browser: { label: "Web e navegador", icon: Globe2 }, documents: { label: "Documentos", icon: FolderOpen },
  email: { label: "E-mail", icon: Wrench }, calendar: { label: "Calendário", icon: Wrench }, memory: { label: "Memória", icon: Wrench },
};
const riskLabel = (tool:ToolRow) => tool.risk === "CRITICAL" ? "Confirmação obrigatória" : tool.mutatesState || tool.risk !== "READ" ? "Pode pedir confirmação" : "Leitura";

export function Tools({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<ToolRow[]>([]), [query, setQuery] = useState(""), [error, setError] = useState("");
  const setPage = useAppStore(s => s.setPage);
  useEffect(() => { let alive = true; void window.nexo.status().then((status: any) => { if (alive) setRows(status.tools ?? []); }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Não foi possível carregar as ferramentas."); }); return () => { alive = false; }; }, []);
  const grouped = useMemo(() => {
    const filtered = rows.filter(tool => `${tool.name} ${tool.description} ${tool.domain ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    const domains = [...new Set(filtered.map(tool => tool.domain ?? tool.name.split("_")[0]))];
    return domains.map(key => [key, groups[key] ?? { label: key[0]?.toUpperCase()+key.slice(1), icon: Wrench }, filtered.filter(tool => (tool.domain ?? tool.name.split("_")[0]) === key)] as const);
  }, [rows, query]);
  return <div className={`toolsPage${embedded ? " embedded" : ""}`}>{!embedded && <header><div><span className="automationEyebrow">CAPACIDADES LOCAIS</span><h1>Ferramentas</h1><p>Catálogo carregado do Core. O Assistente seleciona e executa cada ferramenta dentro das permissões configuradas.</p></div></header>}
    <label className="toolSearch"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ferramentas…"/></label>
    {error && <p role="alert">{error}</p>}{!rows.length && !error && <p>Carregando ferramentas…</p>}
    {grouped.map(([key, group, tools]) => { const Icon = group.icon; return <section className="toolGroup" key={key}><h2><Icon size={18}/>{group.label}<span>{tools.length}</span></h2><div className="toolGrid">{tools.map(tool => <article className={`toolCard ${tool.enabled===false?"disabled":""}`} key={tool.name}><div className="toolCardTitle"><Wrench size={16}/><code>{tool.name}</code></div><p>{tool.description}</p><footer><span className="toolState"><ShieldCheck size={13}/>{tool.enabled===false?"Desativada · Configurações":riskLabel(tool)}</span>{tool.enabled!==false&&<button className="ghost" onClick={() => setPage("Assistente")}>Abrir Assistente</button>}</footer></article>)}</div></section>; })}
    {!error && rows.length > 0 && grouped.length === 0 && <p>Nenhuma ferramenta corresponde à busca.</p>}
  </div>;
}
