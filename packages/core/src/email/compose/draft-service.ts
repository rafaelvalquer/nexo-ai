import { randomUUID } from "node:crypto";
import type { EmailComposeDraftPatch,EmailComposeReviewBlock } from "@nexo/shared";
import { EmailComposeDraftRepository } from "./draft-repository.js";
import type { CreateEmailComposeDraftInput,EmailComposeDraft,EmailDraftExecutor } from "./types.js";
import { validateEmailCompose } from "./validator.js";

export class EmailComposeDraftService{
  constructor(private repository:EmailComposeDraftRepository){}

  create(input:CreateEmailComposeDraftInput){
    return this.createWithId(randomUUID(),input);
  }

  /** Creates an idempotent review draft tied to another stable identifier, such as an approval id. */
  createWithId(id:string,input:CreateEmailComposeDraftInput){
    const existing=this.repository.get(id);
    if(existing)return existing;
    const validated=validateEmailCompose({to:input.to,subject:input.subject,bodyText:input.bodyText});
    return this.repository.create(id,{...input,...validated});
  }

  get(id:string){return this.repository.get(id);}
  getRequired(id:string){const draft=this.get(id);if(!draft)throw new Error("Rascunho de e-mail não encontrado.");return draft;}

  update(id:string,expectedVersion:number,patch:EmailComposeDraftPatch){
    const current=this.getRequired(id);
    if(current.version!==expectedVersion)throw new Error(`O rascunho foi alterado em outra operação. Versão atual: ${current.version}.`);
    const next=validateEmailCompose({to:patch.to??current.to,subject:patch.subject??current.subject,bodyText:patch.bodyText??current.bodyText});
    return this.repository.updateReview(id,expectedVersion,next);
  }

  cancel(id:string,expectedVersion:number){return this.repository.cancel(id,expectedVersion);}

  async submit(id:string,expectedVersion:number,executor:EmailDraftExecutor){
    const sending=this.repository.beginSending(id,expectedVersion);
    try{
      const frozen=Object.freeze({...sending,to:Object.freeze([...sending.to])}) as unknown as Readonly<EmailComposeDraft>;
      const result=await executor(frozen);
      return this.repository.markSent(id,sending.version,result.approvalId);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      this.repository.restoreReviewAfterFailure(id,sending.version,message);
      throw error;
    }
  }

  block(draft:EmailComposeDraft):EmailComposeReviewBlock{
    return{
      id:`email-compose:${draft.id}`,
      version:1,
      type:"email_compose_review",
      draftId:draft.id,
      approvalId:draft.approvalId,
      status:draft.status==="waiting_approval"?"sending":draft.status,
      fields:{to:[...draft.to],subject:draft.subject,bodyText:draft.bodyText},
      error:draft.lastError,
      sentAt:draft.sentAt
    };
  }
}
