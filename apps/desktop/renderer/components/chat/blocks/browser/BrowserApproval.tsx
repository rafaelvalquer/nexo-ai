import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { BrowserRunEvent } from "@nexo/shared/browser-agent";
import { useBrowserRunsStore } from "../../../../stores/browser-runs";
type ApprovalEvent=Extract<BrowserRunEvent,{type:"browser.approval_requested"}>;
export function BrowserApproval({event}:{event:ApprovalEvent}){
  const resolve=useBrowserRunsStore(state=>state.resolveApproval),[busy,setBusy]=useState(false),[resolved,setResolved]=useState<"approved"|"rejected"|null>(null),[error,setError]=useState("");
  async function decide(approved:boolean){if(busy||resolved)return;setBusy(true);setError("");try{await resolve(event.approvalId,approved);setResolved(approved?"approved":"rejected");}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}
  return <section className="browserApproval"><h4><ShieldAlert size={16}/>Browser pausado</h4><p>{event.label}</p>{event.preview&&<pre>{event.preview}</pre>}{resolved?<p role="status">{resolved==="approved"?"Ação confirmada. O navegador continuará.":"Ação recusada. A execução foi cancelada."}</p>:<div><button disabled={busy} onClick={()=>void decide(false)}>Cancelar</button><button disabled={busy} onClick={()=>void decide(true)}>{busy?"Processando…":"Confirmar ação"}</button></div>}{error&&<p className="chatError" role="alert">{error}</p>}</section>;
}
