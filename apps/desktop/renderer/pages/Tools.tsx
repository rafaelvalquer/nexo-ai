import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FolderOpen, Globe2, Monitor, RefreshCw, Search, ShieldCheck, Wrench } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useDeveloperDiagnosticsEnabled } from "../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../utils/user-facing-error";
import { Skeleton } from "../components/ui/Skeleton";

type ToolRow = { name: string; description: string; risk: string; permissions?: string[]; domain?: string; mutatesState?: boolean; enabled?:boolean };
const groups: Record<string, { label: string; icon: typeof Wrench }> = {
  filesystem: { label: "Arquivos", icon: FolderOpen }, system: { label: "Sistema", icon: Monitor },
  browser: { label: "Web e navegador", icon: Globe2 }, documents: { label: "Documentos", icon: FolderOpen },
  email: { label: "E-mail", icon: Wrench }, calendar: { label: "Calendário", icon: Wrench }, memory: { label: "Memória", icon: Wrench },
};
const riskLabel = (tool:ToolRow) => tool.risk === "CRITICAL" ? "Confirmação obrigatória" : tool.mutatesState || tool.risk !== "READ" ? "Pode pedir confirmação" : "Leitura";
type ToolCatalogState = "loading" | "ready" | "empty" | "error" | "stale";

export function Tools({ embedded = false }: { embedded?: boolean } = {}) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const [rows, setRows] = useState<ToolRow[]>([]), [query, setQuery] = useState(""), [error, setError] = useState(""), [loading,setLoading]=useState(true), [state,setState]=useState<ToolCatalogState>("loading");
  const rowsRef=useRef<ToolRow[]>([]),requestId=useRef(0);
  const setPage = useAppStore(s => s.setPage);
  const refresh=useCallback(async()=>{
    const current=++requestId.current;
    setLoading(true);setError("");
    try{
      const status=await window.nexo.status() as {tools?:unknown};
      if(!Array.isArray(status?.tools))throw new Error("Catálogo de ferramentas indisponível.");
      if(current!==requestId.current)return;
      const next=status.tools as ToolRow[];rowsRef.current=next;setRows(next);setState(next.length?"ready":"empty");
    }catch(cause){
      const message=userFacingError(cause,"Não consegui carregar as ferramentas. Tente novamente.",diagnostics);
      if(current===requestId.current){setError(message);setState(rowsRef.current.length?"stale":"error");}
    }finally{if(current===requestId.current)setLoading(false);}
  },[diagnostics]);
  useEffect(()=>{void refresh();return()=>{requestId.current++;};},[refresh]);
  const grouped = useMemo(() => {
    const filtered = rows.filter(tool => `${tool.name} ${tool.description} ${tool.domain ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    const domains = [...new Set(filtered.map(tool => tool.domain ?? tool.name.split("_")[0]))];
    return domains.map(key => [key, groups[key] ?? { label: key[0]?.toUpperCase()+key.slice(1), icon: Wrench }, filtered.filter(tool => (tool.domain ?? tool.name.split("_")[0]) === key)] as const);
  }, [rows, query]);
  return <div className={`toolsPage${embedded ? " embedded" : ""}`}>{!embedded && <header><div><span className="automationEyebrow">CAPACIDADES LOCAIS</span><h1>Ferramentas</h1><p>Catálogo carregado do Core. O Assistente seleciona e executa cada ferramenta dentro das permissões configuradas.</p></div></header>}
    {state!=="loading"&&state!=="error"&&<div className="toolCatalogControls"><label className="toolSearch"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ferramentas…" aria-label="Buscar ferramentas"/></label><button type="button" className="toolRefresh" onClick={()=>void refresh()} disabled={loading} aria-label="Atualizar catálogo de ferramentas"><RefreshCw size={15} className={loading?"toolRefreshingIcon":""}/>{embedded?null:loading?"Atualizando…":"Atualizar"}</button></div>}
    {state==="stale"&&<div className="toolStale" role="status"><span>Não foi possível atualizar o catálogo. Exibindo as ferramentas carregadas anteriormente.</span><button type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14}/> Tentar novamente</button></div>}
    {loading&&rows.length>0&&<span className="toolRefreshStatus" role="status">Atualizando catálogo…</span>}
    {state==="loading"&&rows.length===0&&<div className="toolGrid toolLoadingGrid" role="status" aria-label="Carregando ferramentas" aria-busy="true">{[0,1,2,3].map(index=><article className="toolSkeletonCard" key={index} aria-hidden="true"><Skeleton className="toolSkeletonTitle"/><Skeleton className="toolSkeletonLine"/><Skeleton className="toolSkeletonLine short"/><Skeleton className="toolSkeletonFooter"/></article>)}</div>}
    {state==="error"&&<section className="toolLoadError" role="alert"><AlertTriangle size={20}/><div><h2>Não foi possível carregar as ferramentas</h2><p>{error}</p></div><button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?<RefreshCw size={15} className="toolRefreshingIcon"/>:<RefreshCw size={15}/>} {loading?"Tentando novamente…":"Tentar novamente"}</button></section>}
    {state==="empty"&&<section className="toolEmpty" role="status"><Wrench size={20}/><h2>Nenhuma ferramenta disponível</h2><p>O catálogo local ainda não publicou ferramentas para este perfil.</p><button type="button" className="ghost" onClick={()=>void refresh()} disabled={loading}>{loading?"Atualizando…":"Atualizar catálogo"}</button></section>}
    {state==="stale"&&diagnostics&&error&&<span className="toolDiagnosticError" aria-live="polite">{error}</span>}
    {grouped.map(([key, group, tools]) => { const Icon = group.icon; return <section className="toolGroup" key={key}><h2><Icon size={18}/>{group.label}<span>{tools.length}</span></h2><div className="toolGrid">{tools.map(tool => <article className={`toolCard ${tool.enabled===false?"disabled":""}`} key={tool.name}><div className="toolCardTitle"><Wrench size={16}/><code>{tool.name}</code></div><p>{tool.description}</p><footer><span className="toolState"><ShieldCheck size={13}/>{tool.enabled===false?"Desativada · Configurações":riskLabel(tool)}</span>{tool.enabled!==false&&<button className="ghost" onClick={() => setPage("Assistente")}>Abrir Assistente</button>}</footer></article>)}</div></section>; })}
    {!error && rows.length > 0 && grouped.length === 0 && <p className="toolNoResults" role="status">Nenhuma ferramenta corresponde à busca.</p>}
  </div>;
}
