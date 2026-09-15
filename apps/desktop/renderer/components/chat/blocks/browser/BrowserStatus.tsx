import type { BrowserRun } from "@nexo/shared/browser-agent";
const labels:Record<BrowserRun["status"],string>={starting:"Preparando",running:"Navegador ativo",paused:"Pausado",waiting_approval:"Aguardando aprovação",completed:"Concluído",failed:"Falha",cancelled:"Cancelado"};
export function BrowserStatus({run}:{run:BrowserRun}){return <span className={`browserStatus ${run.status}`}><i/>{labels[run.status]}</span>;}
