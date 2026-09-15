import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { EmailComposeDraftRepository } from "../../packages/core/src/email/compose/draft-repository.js";
import { EmailComposeDraftService } from "../../packages/core/src/email/compose/draft-service.js";

let root:string|undefined;
afterEach(()=>{if(root)fs.rmSync(root,{recursive:true,force:true});root=undefined;});

describe("approval-backed email draft",()=>{
  it("materializes the same approval id only once",async()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-email-approval-draft-"));
    const db=new NexoDatabase(root);await db.ready();
    const service=new EmailComposeDraftService(new EmailComposeDraftRepository(db));
    const id="11111111-1111-4111-8111-111111111111";
    const input={conversationId:"conversation-1",taskId:"task-1",connectionId:"22222222-2222-4222-8222-222222222222",to:["rafael@example.com"],subject:"Oi",bodyText:"Olá"};

    const first=service.createWithId(id,input);
    const second=service.createWithId(id,{...input,subject:"não deve sobrescrever"});

    expect(first.id).toBe(id);
    expect(second.id).toBe(id);
    expect(second.version).toBe(1);
    expect(second.subject).toBe("Oi");
    expect(db.get<{count:number}>("SELECT COUNT(*) count FROM email_compose_drafts WHERE id=?",[id])?.count).toBe(1);
  });
});
