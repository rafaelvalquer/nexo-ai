import { useState } from "react";
import { useDeveloperDiagnosticsEnabled } from "../../../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../../../utils/user-facing-error";
export function ReplyComposer({recipient,onCancel,onSubmit}:{recipient:string;onCancel:()=>void;onSubmit:(body:string)=>Promise<void>}) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const [body,setBody]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(){if(!body.trim()||busy)return;setBusy(true);setError("");try{await onSubmit(body);}catch(error){setError(userFacingError(error,"Não foi possível preparar a resposta. Tente novamente.",diagnostics));}finally{setBusy(false);}}
  return <form className="replyComposer" onSubmit={event=>{event.preventDefault();void submit();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();onCancel();}if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submit();}}}>
    <label>Responder a {recipient}<textarea autoFocus aria-label="Texto da resposta" value={body} onChange={event=>setBody(event.target.value)} rows={5} disabled={busy}/></label><small>Você verá uma prévia para confirmar antes do envio.</small>{error&&<p role="alert">{error}</p>}<div className="inlineFormActions"><button type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button type="submit" disabled={busy||!body.trim()}>{busy?"Preparando…":"Enviar"}</button></div>
  </form>;
}
