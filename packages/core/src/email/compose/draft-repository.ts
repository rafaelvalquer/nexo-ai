import type { NexoDatabase } from "../../database/db.js";
import type { EmailComposeDraft,CreateEmailComposeDraftInput } from "./types.js";

type DraftRow={
  id:string;conversation_id:string;task_id:string|null;connection_id:string|null;to_json:string;subject:string;body_text:string;version:number;status:EmailComposeDraft["status"];approval_id:string|null;last_error:string|null;created_at:string;updated_at:string;sent_at:string|null;
};

export class EmailComposeDraftRepository{
  constructor(private db:NexoDatabase){this.ensureSchema();}

  private ensureSchema(){
    this.db.run(`CREATE TABLE IF NOT EXISTS email_compose_drafts (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      task_id TEXT,
      connection_id TEXT,
      to_json TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      approval_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT
    )`);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_email_compose_drafts_conversation ON email_compose_drafts(conversation_id,updated_at)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_email_compose_drafts_status ON email_compose_drafts(status,updated_at)");
  }

  create(id:string,input:CreateEmailComposeDraftInput):EmailComposeDraft{
    const now=new Date().toISOString();
    this.db.run("INSERT INTO email_compose_drafts(id,conversation_id,task_id,connection_id,to_json,subject,body_text,version,status,approval_id,last_error,created_at,updated_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[
      id,input.conversationId,input.taskId??null,input.connectionId??null,JSON.stringify(input.to),input.subject,input.bodyText,1,"review",null,null,now,now,null
    ]);
    return this.get(id)!;
  }

  get(id:string):EmailComposeDraft|undefined{const row=this.db.get<DraftRow>("SELECT * FROM email_compose_drafts WHERE id=?",[id]);return row?this.toDraft(row):undefined;}

  updateReview(id:string,expectedVersion:number,fields:{to:string[];subject:string;bodyText:string}):EmailComposeDraft{
    return this.db.transaction(()=>{
      const current=this.requireCurrent(id,expectedVersion,"review");const now=new Date().toISOString();
      this.db.run("UPDATE email_compose_drafts SET to_json=?,subject=?,body_text=?,version=?,updated_at=?,last_error=NULL WHERE id=? AND version=? AND status='review'",[
        JSON.stringify(fields.to),fields.subject,fields.bodyText,current.version+1,now,id,expectedVersion
      ]);
      return this.requireCurrent(id,current.version+1,"review");
    });
  }

  beginSending(id:string,expectedVersion:number):EmailComposeDraft{
    return this.db.transaction(()=>{
      this.requireCurrent(id,expectedVersion,"review");const now=new Date().toISOString();
      this.db.run("UPDATE email_compose_drafts SET status='sending',updated_at=?,last_error=NULL WHERE id=? AND version=? AND status='review'",[now,id,expectedVersion]);
      return this.requireCurrent(id,expectedVersion,"sending");
    });
  }

  markSent(id:string,version:number,approvalId?:string):EmailComposeDraft{
    return this.db.transaction(()=>{
      this.requireCurrent(id,version,"sending");const now=new Date().toISOString();
      this.db.run("UPDATE email_compose_drafts SET status='sent',approval_id=?,sent_at=?,updated_at=?,last_error=NULL WHERE id=? AND version=? AND status='sending'",[approvalId??null,now,now,id,version]);
      return this.requireCurrent(id,version,"sent");
    });
  }

  restoreReviewAfterFailure(id:string,version:number,error:string):EmailComposeDraft{
    return this.db.transaction(()=>{
      this.requireCurrent(id,version,"sending");const now=new Date().toISOString();
      this.db.run("UPDATE email_compose_drafts SET status='review',last_error=?,updated_at=? WHERE id=? AND version=? AND status='sending'",[error.slice(0,2000),now,id,version]);
      return this.requireCurrent(id,version,"review");
    });
  }

  cancel(id:string,expectedVersion:number):EmailComposeDraft{
    return this.db.transaction(()=>{
      this.requireCurrent(id,expectedVersion,"review");const now=new Date().toISOString();
      this.db.run("UPDATE email_compose_drafts SET status='cancelled',updated_at=?,last_error=NULL WHERE id=? AND version=? AND status='review'",[now,id,expectedVersion]);
      return this.requireCurrent(id,expectedVersion,"cancelled");
    });
  }

  private requireCurrent(id:string,expectedVersion:number,status:EmailComposeDraft["status"]){
    const draft=this.get(id);if(!draft)throw new Error("Rascunho de e-mail não encontrado.");
    if(draft.version!==expectedVersion)throw new Error(`O rascunho foi alterado em outra operação. Versão atual: ${draft.version}.`);
    if(draft.status!==status)throw new Error(`O rascunho não pode ser alterado no estado ${draft.status}.`);
    return draft;
  }

  private toDraft(row:DraftRow):EmailComposeDraft{
    let to:string[]=[];try{const parsed=JSON.parse(row.to_json);if(Array.isArray(parsed))to=parsed.filter(value=>typeof value==="string");}catch{}
    return{id:row.id,conversationId:row.conversation_id,taskId:row.task_id??undefined,connectionId:row.connection_id??undefined,to,subject:row.subject,bodyText:row.body_text,version:Number(row.version),status:row.status,approvalId:row.approval_id??undefined,lastError:row.last_error??undefined,createdAt:row.created_at,updatedAt:row.updated_at,sentAt:row.sent_at??undefined};
  }
}
