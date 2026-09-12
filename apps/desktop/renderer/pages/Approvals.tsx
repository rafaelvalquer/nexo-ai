import { useEffect, useState } from "react";

function EmailPreview({ input }: { input: any }) {
  const message=input?.message ?? input;
  if (!message?.to || !message?.subject || !message?.bodyText) return null;
  const address=(value:any)=>value?.name ? `${value.name} <${value.email}>` : value?.email;
  return <section className="emailApprovalPreview" aria-label="Prévia do e-mail"><small>PRÉVIA DO RASCUNHO</small><p><b>Para:</b> {message.to.map(address).filter(Boolean).join(", ")}</p>{message.cc?.length>0&&<p><b>Cc:</b> {message.cc.map(address).filter(Boolean).join(", ")}</p>}<p><b>Assunto:</b> {message.subject}</p><pre>{message.bodyText}</pre></section>;
}

export function Approvals() {
  const [rows,setRows]=useState<any[]>([]); const load=()=>window.nexo.listApprovals().then(setRows);
  useEffect(()=>{void load();},[]);
  async function resolve(id:string,approved:boolean){await window.nexo.resolveApproval(id,approved);await load();}
  return <div><header><div><h1>Aprovações</h1><p>Revise a ação antes de permitir sua execução.</p></div></header><section className="panel list">{rows.length===0?<div className="empty">Nenhuma aprovação pendente.</div>:rows.map(approval=><div className="row approvalRow" key={approval.id}><div><b>{approval.toolName}</b><span>{approval.reason}</span>{/^email_/.test(approval.toolName)?<EmailPreview input={approval.input}/>:<code>{JSON.stringify(approval.input)}</code>}</div><div className="actions"><button className="ghost" onClick={()=>void resolve(approval.id,false)}>Rejeitar</button><button onClick={()=>void resolve(approval.id,true)}>Permitir</button></div></div>)}</section></div>;
}
