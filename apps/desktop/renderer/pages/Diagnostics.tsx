import { useEffect, useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { useAppStore } from "../stores/app";

type Status = { llm?:{ok:boolean;detail:string}; settings?:{model:string;embeddingModel:string}; metrics?:Array<{metric:string;count:number;average:number;latest:string}> };
export function Diagnostics() {
  const [status,setStatus]=useState<Status|null>(null);const [loading,setLoading]=useState(false);const setPage=useAppStore(s=>s.setPage);
  const refresh=async()=>{setLoading(true);try{setStatus(await window.nexo.status());}finally{setLoading(false);}};
  useEffect(()=>{void refresh();},[]);
  return <div><header><div><h1>Diagnóstico</h1><p>Métricas locais de operação. Nenhum dado é enviado para fora do Nexo.</p></div><button className="ghost" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></header><section className="grid4"><div className="card"><span>Ollama</span><b className={status?.llm?.ok?"successText":"errorText"}>{status?.llm?.ok?"Disponível":"Indisponível"}</b><small>{status?.llm?.detail??"Verificando…"}</small></div><div className="card"><span>Modelo de chat</span><b>{status?.settings?.model??"—"}</b></div><div className="card"><span>Embeddings</span><b>{status?.settings?.embeddingModel??"—"}</b></div><div className="card"><span>Métricas</span><b>{status?.metrics?.reduce((total,item)=>total+item.count,0)??0}</b><small>amostras locais</small></div></section><section className="panel"><h3>Execução e falhas</h3>{!status?.metrics?.length?<div className="empty">Ainda não há métricas. Execute uma ferramenta para registrar duração e falhas.</div>:<div className="list">{status.metrics.map(metric=><div className="row" key={metric.metric}><div><b>{metric.metric}</b><span>{metric.count} amostra(s) · média {metric.average} · última {new Date(metric.latest).toLocaleString()}</span></div></div>)}</div>}<button className="ghost" onClick={()=>setPage("Configurações")}><Settings size={15}/> Abrir configurações</button></section></div>;
}
