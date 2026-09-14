import { useEffect, useState } from "react";

function EmailPreview({ input }: { input: any }) {
  const message=input?.message ?? input;
  if (!message?.to || !message?.subject || !message?.bodyText) return null;
  const address=(value:any)=>value?.name ? `${value.name} <${value.email}>` : value?.email;
  return <section className="emailApprovalPreview" aria-label="Prévia do e-mail"><small>PRÉVIA DO E-MAIL</small><p><b>Para:</b> {message.to.map(address).filter(Boolean).join(", ")}</p>{message.cc?.length>0&&<p><b>Cc:</b> {message.cc.map(address).filter(Boolean).join(", ")}</p>}<p><b>Assunto:</b> {message.subject}</p><pre>{message.bodyText}</pre></section>;
}

function ActionPreview({approval}:{approval:any}){
  if(approval.preview)return <section className="emailApprovalPreview" aria-label="Prévia da ação"><small>PRÉVIA DA AÇÃO</small><pre>{approval.preview}</pre>{approval.affectedCount!==undefined&&<p><b>Itens afetados:</b> {approval.affectedCount}</p>}{approval.consequence&&<p><b>Consequência:</b> {approval.consequence}</p>}{approval.expiresAt&&<p><small>Confirmação válida até {new Date(approval.expiresAt).toLocaleTimeString("pt-BR")}</small></p>}</section>;
  return /^email_/.test(approval.toolName)?<EmailPreview input={approval.input}/>:<code>{JSON.stringify(approval.input)}</code>;
}

export function Approvals() {
  const [rows,setRows]=useState<any[]>([]); const load=()=>window.nexo.listApprovals().then(setRows);
  useEffect(()=>{void load();},[]);
  async function resolve(id:string,approved:boolean){try{await window.nexo.resolveApproval(id,approved);}finally{await load();}}
  return <div><header><div><h1>Aprovações</h1><p>Toda alteração em e-mail, agenda, arquivos ou outros dados precisa da sua confirmação antes de ser executada.</p></div></header><section className="panel list">{rows.length===0?<div className="empty">Nenhuma aprovação pendente.</div>:rows.map(approval=><div className="row approvalRow" key={approval.id}><div><b>{approval.domain?`${approval.domain} · `:""}{approval.toolName}</b><span>{approval.reason}</span><ActionPreview approval={approval}/></div><div className="actions"><button className="ghost" onClick={()=>void resolve(approval.id,false)}>Cancelar</button><button onClick={()=>void resolve(approval.id,true)}>Confirmar</button></div></div>)}</section></div>;
}
