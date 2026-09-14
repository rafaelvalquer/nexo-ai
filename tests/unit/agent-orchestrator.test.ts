import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LLMMessage, LLMProvider } from "../../packages/core/src/llm/provider.js";
import { IntentOrchestrator } from "../../packages/core/src/agent/orchestrator/intent-orchestrator.js";
import { buildIntentPlan } from "../../packages/core/src/agent/orchestrator/plan-builder.js";
import { materializeDeferredAction } from "../../packages/core/src/agent/orchestrator/action-preflight.js";
import { resolvePeriod } from "../../packages/core/src/agent/orchestrator/temporal-resolver.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";

class FakeLLM implements LLMProvider {
  constructor(private outputs:string[]){}
  health=async()=>({ok:true}); models=async()=>[]; pullModel=async()=>({ok:true,model:"fake"});
  chat=async()=>"ok"; stream=async(_messages:LLMMessage[],onToken:(t:string)=>void)=>{onToken("ok");return"ok";}; summarize=async()=>"ok"; embed=async()=>[];
  plan=async()=>this.outputs.shift()??"{}";
}

const emailTools:any[]=[
  {name:"email_search",description:"Pesquisa",domain:"email",operation:"search",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["email.read"]},
  {name:"email_get_many",description:"Lê vários",domain:"email",operation:"read_many",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["email.read"]},
  {name:"email_bulk_trash",description:"Lixeira em lote",domain:"email",operation:"trash",risk:"CRITICAL",mutatesState:true,requiresConfirmation:true,permissions:["email.modify"]},
  {name:"email_send_composed",description:"Envia",domain:"email",operation:"send",risk:"SENSITIVE",mutatesState:true,requiresConfirmation:true,permissions:["email.send"]}
];
const calendarTools:any[]=[{name:"calendar_list",description:"Agenda",domain:"calendar",operation:"list_events",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["calendar.read"]}];

describe("Ollama intent orchestrator",()=>{
  it("parses an email delete intent without executing a tool",async()=>{
    const llm=new FakeLLM([JSON.stringify({status:"ready",domain:"email",intent:"delete",operation:"bulk_trash",entities:{sender:"notifications@github.com"},referencesPreviousResult:false,requiresDataLookup:true,requiresConfirmation:true,confidence:.98})]);
    const intent=await new IntentOrchestrator(llm).interpret("delete os emails do github",emailTools);
    expect(intent).toMatchObject({domain:"email",intent:"delete",requiresConfirmation:true});
    const plan=buildIntentPlan(intent,emailTools);
    expect(plan.steps?.[0].tool).toBe("email_search");
    expect(plan.deferredAction).toMatchObject({kind:"email.bulk",action:"trash"});
  });

  it("retries once when Ollama returns invalid JSON",async()=>{
    const llm=new FakeLLM(["não é json",JSON.stringify({status:"ready",domain:"calendar",intent:"list",operation:"list_events",entities:{period:"tomorrow"},referencesPreviousResult:false,requiresDataLookup:true,requiresConfirmation:false,confidence:.99})]);
    const intent=await new IntentOrchestrator(llm).interpret("minha agenda amanhã",calendarTools);
    expect(intent).toMatchObject({domain:"calendar",intent:"list"});
  });

  it("freezes email ids during preflight instead of querying again after approval",()=>{
    const materialized=materializeDeferredAction({kind:"email.bulk",action:"trash",sender:"notifications@github.com"},{ok:true,summary:"2",data:{messages:[{id:"m1",from:{email:"notifications@github.com"},subject:"A"},{id:"m2",from:{email:"notifications@github.com"},subject:"B"},{id:"m3",from:{email:"other@example.com"},subject:"C"}]}});
    expect(materialized.step?.tool).toBe("email_bulk_trash");
    expect(materialized.step?.input).toEqual({messageIds:["m1","m2"]});
    expect(materialized.step?.approval?.affectedCount).toBe(2);
  });

  it("converts tomorrow to a deterministic one-day interval",()=>{
    const range=resolvePeriod("tomorrow",new Date(2026,8,13,20,0,0));
    expect(new Date(range.end).getTime()-new Date(range.start).getTime()).toBe(24*60*60*1000);
  });
});

describe("approval safety",()=>{
  let root:string;let db:NexoDatabase;
  beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-approval-"));db=new NexoDatabase(root);await db.ready();});
  afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

  it("stores a fingerprint and exact mutation preview",()=>{
    const service=new ApprovalService(db);
    const approval=service.create("email_bulk_trash",{messageIds:["m1","m2"]},"CRITICAL","Mover para lixeira",undefined,{domain:"email",actionType:"trash",affectedCount:2,preview:"2 e-mails",consequence:"Mover 2 e-mails"});
    expect(approval.fingerprint).toHaveLength(64);
    expect(approval.affectedCount).toBe(2);
    expect(service.resolve(approval.id,true)?.status).toBe("approved");
  });

  it("refuses an expired mutation approval",()=>{
    const service=new ApprovalService(db);
    const approval=service.create("calendar_delete",{eventId:"e1"},"CRITICAL","Cancelar",undefined,{expiresInMs:-1});
    expect(()=>service.resolve(approval.id,true)).toThrow(/expirou/i);
  });
});
