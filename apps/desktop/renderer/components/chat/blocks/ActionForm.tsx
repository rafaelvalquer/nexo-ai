import { useState } from "react";
import type { ChatActionRequest, ResourceItem } from "@nexo/shared";
import { useDeveloperDiagnosticsEnabled } from "../../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../../utils/user-facing-error";
export function ActionForm({actionId,item,onCancel,onSubmit}:{actionId:string;item:ResourceItem;onCancel:()=>void;onSubmit:(values:NonNullable<ChatActionRequest["values"]>)=>Promise<void>}) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const resource=item.resource;
  const [values,setValues]=useState<Record<string,string>>(actionId==="file.rename"&&(resource.kind==="file"||resource.kind==="folder")?{newName:resource.name}:actionId==="calendar.edit"&&resource.kind==="calendar"?{title:resource.title,location:resource.location??"",start:localDate(resource.start),end:localDate(resource.end)}:{response:"accept"});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const fields=actionId==="file.rename"?[["newName","Novo nome","text"]]:actionId==="file.move"?[["destination","Pasta de destino","text"]]:actionId==="folder.search"?[["query","Pesquisar por nome","text"]]:actionId==="calendar.edit"?[["title","Título","text"],["start","Início","datetime-local"],["end","Término","datetime-local"],["location","Local","text"]]:[];
  return <form className="resourceActionForm" onKeyDown={event=>{if(event.key==="Escape")onCancel();}} onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");try{const submitted={...values} as NonNullable<ChatActionRequest["values"]>;if(actionId==="calendar.edit"){submitted.start=new Date(values.start).toISOString();submitted.end=new Date(values.end).toISOString();}await onSubmit(submitted);}catch(error){setError(userFacingError(error,"Não foi possível aplicar essa alteração. Revise os dados e tente novamente.",diagnostics));}finally{setBusy(false);}}}>
    {fields.map(([name,label,type],index)=><label key={name}>{label}<input autoFocus={index===0} type={type} value={values[name]??""} required={name!=="location"} onChange={event=>setValues({...values,[name]:event.target.value})}/></label>)}
    {actionId==="calendar.rsvp"&&<label htmlFor="calendar-rsvp-response">Resposta ao convite<select id="calendar-rsvp-response" aria-label="Resposta ao convite" autoFocus value={values.response} onChange={event=>setValues({response:event.target.value})}><option value="accept">Aceitar</option><option value="tentative">Talvez</option><option value="decline">Recusar</option></select></label>}
    {error&&<p role="alert">{error}</p>}<div className="inlineFormActions"><button type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button disabled={busy} type="submit">{busy?"Preparando…":actionId==="folder.search"?"Pesquisar":"Revisar alteração"}</button></div>
  </form>;
}
function localDate(value:string){const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
