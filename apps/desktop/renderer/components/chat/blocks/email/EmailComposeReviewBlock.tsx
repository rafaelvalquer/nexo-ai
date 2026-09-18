import { useCallback,useEffect,useRef,useState } from "react";
import { Mail } from "lucide-react";
import type { EmailComposeDraftSnapshot,EmailComposeReviewBlock as EmailComposeReviewModel } from "@nexo/shared";
import { RecipientInput } from "./RecipientInput";
import { SubjectInput } from "./SubjectInput";
import { EmailBodyEditor } from "./EmailBodyEditor";
import { EmailComposeStatus } from "./EmailComposeStatus";
import { useDeveloperDiagnosticsEnabled } from "../../../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../../../utils/user-facing-error";
import "./email-compose.css";

const EMAIL=/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
type Fields={to:string[];subject:string;bodyText:string};

export function EmailComposeReviewBlock({block}:{block:EmailComposeReviewModel}){
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const initial:EmailComposeDraftSnapshot={id:block.draftId,conversationId:"",to:[...block.fields.to],subject:block.fields.subject,bodyText:block.fields.bodyText,version:1,status:block.status==="expired"?"cancelled":block.status,approvalId:block.approvalId,createdAt:"",updatedAt:"",sentAt:block.sentAt};
  const[draft,setDraft]=useState<EmailComposeDraftSnapshot>(initial),[fields,setFields]=useState<Fields>({...block.fields,to:[...block.fields.to]}),[busy,setBusy]=useState(false),[error,setError]=useState(block.error?userFacingError(block.error,"Não foi possível preparar o e-mail para revisão.",diagnostics):"");
  const draftRef=useRef(draft),fieldsRef=useRef(fields),saveChain=useRef<Promise<EmailComposeDraftSnapshot>>(Promise.resolve(initial)),timerRef=useRef<number>(),rootRef=useRef<HTMLElement>(null);
  draftRef.current=draft;fieldsRef.current=fields;

  const applyDraft=useCallback((next:EmailComposeDraftSnapshot)=>{draftRef.current=next;setDraft(next);setFields({to:[...next.to],subject:next.subject,bodyText:next.bodyText});setError(next.lastError?userFacingError(next.lastError,"Não foi possível atualizar o e-mail. Tente novamente.",diagnostics):"");return next;},[diagnostics]);
  const applyPersistedVersion=useCallback((next:EmailComposeDraftSnapshot)=>{draftRef.current=next;setDraft(next);setError(next.lastError?userFacingError(next.lastError,"Não foi possível atualizar o e-mail. Tente novamente.",diagnostics):"");return next;},[diagnostics]);

  const queueSave=useCallback((target:Fields)=>{
    const run=saveChain.current.catch(()=>draftRef.current).then(async current=>{
      if(current.status!=="review")return current;
      if(equalFields(current,target))return current;
      const updated=await window.nexo.updateEmailDraft({draftId:current.id,expectedVersion:current.version,patch:{to:[...target.to],subject:target.subject,bodyText:target.bodyText}}) as EmailComposeDraftSnapshot;
      return applyPersistedVersion(updated);
    });
    saveChain.current=run;
    return run;
  },[applyPersistedVersion]);

  useEffect(()=>{
    let active=true;
    void (async()=>{try{const current=await window.nexo.getEmailDraft(block.draftId) as EmailComposeDraftSnapshot;if(active){applyDraft(current);saveChain.current=Promise.resolve(current);}}catch(caught){if(active)setError(userFacingError(caught,"Não consegui carregar o e-mail para revisão. Tente novamente.",diagnostics));}})();
    requestAnimationFrame(()=>requestAnimationFrame(()=>rootRef.current?.scrollIntoView({behavior:"smooth",block:"center"})));
    return()=>{active=false;};
  },[applyDraft,block.draftId,diagnostics]);

  useEffect(()=>{
    if(draft.status!=="review"||busy)return;
    if(timerRef.current!==undefined)window.clearTimeout(timerRef.current);
    const snapshot={to:[...fields.to],subject:fields.subject,bodyText:fields.bodyText};
    timerRef.current=window.setTimeout(()=>{void queueSave(snapshot).catch(caught=>setError(userFacingError(caught,"Não foi possível salvar a edição do e-mail. Tente novamente.",diagnostics)));},400);
    return()=>{if(timerRef.current!==undefined)window.clearTimeout(timerRef.current);};
  },[busy,draft.status,fields,queueSave,diagnostics]);

  const validation=validate(fields),locked=busy||draft.status!=="review";

  async function submit(){
    if(locked||validation)return;
    if(timerRef.current!==undefined)window.clearTimeout(timerRef.current);
    setBusy(true);setError("");
    try{
      const saved=await queueSave({to:[...fieldsRef.current.to],subject:fieldsRef.current.subject,bodyText:fieldsRef.current.bodyText});
      const sent=await window.nexo.submitEmailDraft({draftId:saved.id,expectedVersion:saved.version}) as EmailComposeDraftSnapshot;
      applyDraft(sent);
    }catch(caught){
      setError(userFacingError(caught,"Não foi possível enviar o e-mail. Confira os dados e tente novamente.",diagnostics));
      try{const current=await window.nexo.getEmailDraft(block.draftId) as EmailComposeDraftSnapshot;applyDraft(current);}catch{}
    }finally{setBusy(false);}
  }

  async function cancel(){
    if(locked)return;
    if(timerRef.current!==undefined)window.clearTimeout(timerRef.current);
    setBusy(true);setError("");
    try{
      const saved=await queueSave({to:[...fieldsRef.current.to],subject:fieldsRef.current.subject,bodyText:fieldsRef.current.bodyText});
      const cancelled=await window.nexo.cancelEmailDraft({draftId:saved.id,expectedVersion:saved.version}) as EmailComposeDraftSnapshot;
      applyDraft(cancelled);
    }catch(caught){setError(userFacingError(caught,"Não foi possível cancelar o envio. Tente novamente.",diagnostics));}
    finally{setBusy(false);}
  }

  if(draft.status==="sent"||draft.status==="cancelled")return <section ref={rootRef} data-email-draft-id={draft.id}><EmailComposeStatus draft={draft}/></section>;

  return <section ref={rootRef} className="emailComposeReview" data-email-draft-id={draft.id} tabIndex={-1} aria-label="Revisar e-mail">
    <h3><Mail size={18}/>Novo e-mail</h3>
    <p className="emailComposeLead">Revise o e-mail antes de enviar.</p>
    <label>Para<RecipientInput value={fields.to} disabled={locked} onChange={to=>setFields(current=>({...current,to}))}/></label>
    <label>Assunto<SubjectInput value={fields.subject} disabled={locked} onChange={subject=>setFields(current=>({...current,subject}))}/></label>
    <label>Mensagem<EmailBodyEditor value={fields.bodyText} disabled={locked} onChange={bodyText=>setFields(current=>({...current,bodyText}))}/></label>
    {validation&&<p className="emailComposeFieldError" role="alert">{validation}</p>}
    {error&&<div className="emailComposeError" role="alert"><strong>Não foi possível enviar o e-mail.</strong><span>{error}</span></div>}
    <div className="emailComposeActions"><button type="button" disabled={locked} onClick={()=>void cancel()}>Cancelar</button><button type="button" className="primary" disabled={locked||Boolean(validation)} onClick={()=>void submit()}>{busy?"Enviando...":error?"Tentar novamente":"Enviar e-mail"}</button></div>
  </section>;
}

function validate(fields:Fields){
  if(!fields.to.length)return"Informe pelo menos um destinatário.";
  if(fields.to.some(email=>!EMAIL.test(email)))return"Todos os destinatários precisam ter um endereço de e-mail válido.";
  if(fields.to.length>50)return"O envio aceita no máximo 50 destinatários.";
  if(fields.subject.length>998)return"O assunto ultrapassa o limite permitido.";
  if(!fields.bodyText.trim())return"A mensagem não pode estar vazia.";
  return"";
}
function equalFields(draft:EmailComposeDraftSnapshot,fields:Fields){return draft.subject===fields.subject&&draft.bodyText===fields.bodyText&&draft.to.length===fields.to.length&&draft.to.every((value,index)=>value===fields.to[index]);}
