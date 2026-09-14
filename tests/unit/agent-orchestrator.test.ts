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
import { parseStructuredJson } from "../../packages/core/src/llm/structured-response-parser.js";
import { resolveUserPath } from "../../packages/core/src/filesystem/path-resolver.js";
import { observeConversationActionContext } from "../../packages/core/src/agent/context/conversation-action-context.js";

class FakeLLM implements LLMProvider {
  constructor(private outputs:string[]){}
  health=async()=>({ok:true,detail:"ok"}); models=async()=>[];
  chat=async()=>"ok"; stream=async(_messages:LLMMessage[],onToken:(t:string)=>void)=>{onToken("ok");return"ok";}; summarize=async()=>"ok"; embed=async()=>[];
  plan=async()=>this.outputs.shift()??"{}";
}

const emailTools:any[]=[
  {name:"email_search",description:"Pesquisa",domain:"email",operation:"search",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["email.read"]},
  {name:"email_get_many",description:"Lê vários",domain:"email",operation:"read_many",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["email.read"]},
  {name:"email_bulk_trash",description:"Lixeira em lote",domain:"email",operation:"trash",risk:"CRITICAL",mutatesState:true,requiresConfirmation:true,permissions:["email.modify"]},
  {name:"email_send_composed",description:"Envia",domain:"email",operation:"send",risk:"SENSITIVE",mutatesState:true,requiresConfirmation:true,permissions:["email.send"]}
];
const calendarTools:any[]=[
  {name:"calendar_list",description:"Agenda",domain:"calendar",operation:"list_events",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["calendar.read"]},
  {name:"calendar_find_free_time",description:"Horários livres",domain:"calendar",operation:"find_free_time",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["calendar.read"]}
];
const filesystemTools:any[]=[
  {name:"list_files",description:"Lista",domain:"filesystem",operation:"list",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["filesystem.read"]},
  {name:"file_info",description:"Info",domain:"filesystem",operation:"info",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:["filesystem.read"]},
  {name:"trash_file",description:"Lixeira",domain:"filesystem",operation:"trash",risk:"CRITICAL",mutatesState:true,requiresConfirmation:true,permissions:["filesystem.write"]}
];

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

  it("falls back safely for obvious email reads when the model returns invalid output twice",async()=>{
    const intent=await new IntentOrchestrator(new FakeLLM(["texto", "ainda inválido"])).interpret("quais são os meus últimos e-mails?",emailTools);
    expect(intent).toMatchObject({domain:"email",intent:"list",operation:"recent_messages"});
  });

  it("falls back safely for tomorrow calendar queries",async()=>{
    const intent=await new IntentOrchestrator(new FakeLLM(["?", "?"])).interpret("qual a minha agenda para amanhã?",calendarTools);
    expect(intent).toMatchObject({domain:"calendar",intent:"list",entities:{period:"tomorrow"}});
  });

  it("forces repeated independent email queries to refresh live data even if the model marks them as previous-result references",async()=>{
    const previous:any={
      updatedAt:new Date().toISOString(),lastDomain:"email",lastIntent:"search",lastTool:"email_search",lastQuery:"liste meus e-mails não lidos",
      emails:[{id:"old-1",from:"old@example.com",subject:"Antigo"}]
    };
    const llm=new FakeLLM([JSON.stringify({schemaVersion:1,status:"ready",domain:"email",intent:"search",operation:"search_messages",entities:{unread:true,maxResults:20},referencesPreviousResult:true,reference:{source:"previous_result",selection:{type:"all"}},requiresDataLookup:true,requiresConfirmation:false,confidence:.99})]);
    const intent=await new IntentOrchestrator(llm).interpret("liste meus e-mails não lidos",emailTools,{previous});
    expect(intent.referencesPreviousResult).toBe(false);
    expect(intent.reference).toBeUndefined();
    const plan=buildIntentPlan(intent,emailTools,previous);
    expect(plan.steps?.[0]).toMatchObject({tool:"email_search",input:{unread:true,maxResults:20}});
  });

  it("keeps previous-result reuse for explicit follow-ups",async()=>{
    const previous:any={
      updatedAt:new Date().toISOString(),lastDomain:"email",lastIntent:"search",lastTool:"email_search",lastQuery:"liste meus e-mails não lidos",
      emails:[{id:"m1",from:"a@example.com",subject:"A"},{id:"m2",from:"b@example.com",subject:"B"}]
    };
    const llm=new FakeLLM([JSON.stringify({schemaVersion:1,status:"ready",domain:"email",intent:"summarize",operation:"summarize_previous",entities:{},referencesPreviousResult:true,reference:{source:"previous_result",selection:{type:"all"}},requiresDataLookup:true,requiresConfirmation:false,confidence:.99})]);
    const intent=await new IntentOrchestrator(llm).interpret("resuma esses e-mails",emailTools,{previous});
    expect(intent.referencesPreviousResult).toBe(true);
    const plan=buildIntentPlan(intent,emailTools,previous);
    expect(plan.steps?.[0]).toMatchObject({tool:"email_get_many",input:{messageIds:["m1","m2"]}});
  });

  it("freezes email ids during preflight instead of querying again after approval",()=>{
    const materialized=materializeDeferredAction({kind:"email.bulk",action:"trash",sender:"notifications@github.com"},{ok:true,summary:"2",data:{messages:[{id:"m1",from:{email:"notifications@github.com"},subject:"A"},{id:"m2",from:{email:"notifications@github.com"},subject:"B"},{id:"m3",from:{email:"other@example.com"},subject:"C"}]}});
    expect(materialized.step?.tool).toBe("email_bulk_trash");
    expect(materialized.step?.input).toEqual({messageIds:["m1","m2"]});
    expect(materialized.step?.approval?.affectedCount).toBe(2);
  });

  it("resolves Downloads before filesystem permission checks and preflights trash",async()=>{
    const llm=new FakeLLM([JSON.stringify({schemaVersion:1,status:"ready",domain:"filesystem",intent:"delete",operation:"trash_file",entities:{folder:"downloads",file:"relatorioSolar20260911.csv"},referencesPreviousResult:false,requiresDataLookup:true,requiresConfirmation:true,confidence:.99})]);
    const intent=await new IntentOrchestrator(llm).interpret("delete o arquivo relatorioSolar20260911.csv da pasta download",filesystemTools);
    const plan=buildIntentPlan(intent,filesystemTools);
    expect(plan.steps?.[0]).toMatchObject({tool:"file_info",input:{path:path.join(os.homedir(),"Downloads","relatorioSolar20260911.csv")}});
    expect(plan.deferredAction).toMatchObject({kind:"filesystem.trash",path:path.join(os.homedir(),"Downloads","relatorioSolar20260911.csv")});
    const materialized=materializeDeferredAction(plan.deferredAction!,{ok:true,summary:"Metadados",data:{size:2048,isDirectory:false}});
    expect(materialized.step?.tool).toBe("trash_file");
    expect(materialized.step?.approval?.consequence).toMatch(/lixeira/i);
  });

  it("converts tomorrow to a deterministic one-day interval",()=>{
    const range=resolvePeriod("tomorrow",new Date(2026,8,13,20,0,0));
    expect(new Date(range.end).getTime()-new Date(range.start).getTime()).toBe(24*60*60*1000);
  });
});

describe("conversation action freshness",()=>{
  it("clears stale email ids when a new live Gmail search returns no messages",()=>{
    const previous:any={updatedAt:new Date().toISOString(),lastDomain:"email",emails:[{id:"stale-1",subject:"Já removido"}]};
    const next=observeConversationActionContext(previous,"liste meus e-mails não lidos",undefined,{tool:"email_search",input:{unread:true}},{ok:true,summary:"Nenhum e-mail encontrado.",data:{messages:[]}});
    expect(next.emails).toEqual([]);
  });

  it("invalidates cached email selections after a successful mailbox mutation",()=>{
    const previous:any={updatedAt:new Date().toISOString(),lastDomain:"email",emails:[{id:"m1",subject:"A"},{id:"m2",subject:"B"}]};
    const next=observeConversationActionContext(previous,"apague esses e-mails",undefined,{tool:"email_bulk_trash",input:{messageIds:["m1","m2"]}},{ok:true,summary:"2 e-mails alterados",data:{requested:2,succeeded:2,failed:0,failures:[]}});
    expect(next.emails).toBeUndefined();
  });
});

describe("structured parsing and paths",()=>{
  it("extracts JSON even when the model adds text around it",()=>{
    expect(parseStructuredJson('Aqui está: {"domain":"email","confidence":0.9} obrigado')).toEqual({domain:"email",confidence:.9});
  });

  it("resolves known user folders and rejects traversal",()=>{
    expect(resolveUserPath({folder:"download",file:"teste.csv"})).toBe(path.join(os.homedir(),"Downloads","teste.csv"));
    expect(resolveUserPath({folder:"download",file:"../segredo.txt"})).toBeUndefined();
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
