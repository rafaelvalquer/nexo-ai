import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ApprovalBlock as ApprovalModel,EmailComposeReviewBlock as EmailComposeReviewModel } from "@nexo/shared";
import { useAssistantStore } from "../../../stores/assistant";
import { EmailComposeReviewBlock } from "./email/EmailComposeReviewBlock";
import { editableEmailReviewInitialStatus } from "./email/approval-review-state";

export function ApprovalBlock({block,conversationId,messageId}:{block:ApprovalModel;conversationId?:string;messageId?:string}) {
  const resolve=useAssistantStore(store=>store.resolveInlineApproval),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const expired=block.status==="expired" || block.status==="pending" && Boolean(block.expiresAt&&Date.parse(block.expiresAt)<=Date.now());
  const pending=block.status==="pending"&&!expired;
  const editableEmailStatus=editableEmailReviewInitialStatus(block,expired);

  if(block.editableEmail&&editableEmailStatus){
    const review:EmailComposeReviewModel={
      id:block.id,
      version:1,
      type:"email_compose_review",
      draftId:block.approvalId,
      approvalId:block.approvalId,
      status:editableEmailStatus,
      fields:{...block.editableEmail,to:[...block.editableEmail.to]},
      expiresAt:block.expiresAt
    };
    return <EmailComposeReviewBlock block={review}/>;
  }

  async function decide(approved:boolean){if(busy)return;setBusy(true);setError("");try{if(conversationId&&messageId)await resolve(conversationId,messageId,block.approvalId,approved);else await window.nexo.resolveApproval(block.approvalId,approved);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}
  return <section className="inlineApproval" data-approval-id={block.approvalId} tabIndex={-1} aria-label="Confirmação da ação"><h3><ShieldCheck size={17}/>{block.title}</h3>{block.preview&&<p className="approvalPreview">{block.preview}</p>}{block.consequence&&<p>{block.consequence}</p>}{pending?<div className="inlineFormActions"><button type="button" disabled={busy} onClick={()=>void decide(false)}>Cancelar</button><button type="button" disabled={busy} onClick={()=>void decide(true)}>{busy?"Processando…":"Confirmar"}</button></div>:<p role="status">{expired?"Aprovação expirada. Gere uma nova prévia.":block.status==="approved"?"Aprovação concedida":"Ação cancelada"}</p>}{error&&<p className="chatError" role="alert">{error}</p>}</section>;
}
