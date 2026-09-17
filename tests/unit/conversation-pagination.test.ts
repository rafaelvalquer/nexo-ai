import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConversationService } from "../../packages/core/src/conversations/service.js";
import { ConversationContextBuilder } from "../../packages/core/src/agent/context/conversation-context.js";
import { validateConversationPageOptions } from "../../packages/shared/src/conversation-pagination.js";
import { NexoCore } from "../../packages/core/src/index.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
let root:string,db:NexoDatabase,service:ConversationService,id:string;
const stamp="2026-09-16T12:00:00.000Z";
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-pages-"));db=new NexoDatabase(root);await db.ready();service=new ConversationService(db);id=service.defaultConversation().id;});
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});});
function seed(count=551){db.transaction(()=>{for(let i=0;i<count;i++)db.run("INSERT INTO messages VALUES(?,?,?,?,?)",[`m-${String(i).padStart(4,"0")}`,id,i%2?"assistant":"user",`text ${i}`,stamp]);});}
it("reads the latest 200 and paginates all 551 tied timestamps without duplicates",()=>{
  seed();expect(service.getMessages(id)).toHaveLength(200);expect(service.getMessages(id).at(-1)?.content).toBe("text 550");
  let page=service.getMessagePage(id);expect(page.messages).toHaveLength(50);expect(page.messages[0].content).toBe("text 501");
  const all=[...page.messages];while(page.hasMore){page=service.getMessagePage(id,{before:page.nextCursor});all.unshift(...page.messages);}
  expect(all).toHaveLength(551);expect(new Set(all.map(m=>m.id)).size).toBe(551);expect(all[0].content).toBe("text 0");
  expect(new ConversationContextBuilder().build(service.getMessages(id)).at(-1)?.content).toBe("text 550");
});
it("handles empty, exact-page and new arrivals between pages",()=>{
  expect(service.getMessagePage(id)).toEqual({messages:[],hasMore:false,nextCursor:undefined});seed(50);
  expect(service.getMessagePage(id).hasMore).toBe(false);
  const first=service.getMessagePage(id,{limit:25});
  db.run("INSERT INTO messages VALUES(?,?,?,?,?)",["new",id,"user","new","2026-09-17T12:00:00.000Z"]);
  const older=service.getMessagePage(id,{limit:25,before:first.nextCursor});
  expect(older.messages).toHaveLength(25);expect(older.hasMore).toBe(false);expect(older.messages.at(-1)?.content).toBe("text 24");
  expect(service.getMessages(id).at(-1)?.content).toBe("new");
});
it("validates IPC/Core cursors and isolates message ownership",()=>{
  seed(1);const other=service.createConversation();
  for(const input of [{limit:0},{limit:201},{limit:1.5},{before:{conversationId:other.id,createdAt:stamp,id:"m"}},{before:{conversationId:id,createdAt:"bad",id:"m"}},null])expect(()=>validateConversationPageOptions(id,input)).toThrow();
  expect(service.getMessage(other.id,"m-0000")).toBeUndefined();expect(service.getMessage(id,"m-0000")?.content).toBe("text 0");
});
it("hydrates a page with bounded queries and has the cursor index",()=>{
  seed();const queries=vi.spyOn(db,"all");service.getMessagePage(id,{limit:200});expect(queries.mock.calls.length).toBeLessThanOrEqual(7);
  expect(db.all<{name:string}>("PRAGMA index_list(messages)").some(row=>row.name==="idx_messages_conversation_cursor")).toBe(true);
});
it("writes the whole message atomically and rolls back invalid attachments",()=>{
  const exports=vi.spyOn((db as any).db,"export");service.addMessage(id,"user","title","task");expect(exports).toHaveBeenCalledTimes(1);
  expect(()=>service.addMessage(id,"user","invalid","bad-task",["missing"])).toThrow();
  expect(service.getMessages(id)).toHaveLength(1);expect(db.get("SELECT * FROM application_state WHERE value='bad-task'")).toBeUndefined();
});
it("resolves approval ownership outside the latest page through Core",async()=>{
  const approvals=new ApprovalService(db);const approval=approvals.create("test",{},"WRITE","test");
  const old=service.addMessage(id,"assistant","old");
  db.run("UPDATE messages SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?",[old.id]);
  service.savePresentation(old.id,{presentation:{version:1,blocks:[{id:"block",version:1,type:"approval",approvalId:approval.id,title:"Review",preview:"test",consequence:"test",status:"pending"}]},bindings:[]});seed();
  expect(service.getMessages(id).some(m=>m.id===old.id)).toBe(false);
  const approve=vi.fn(async()=>({ok:true}));
  await NexoCore.prototype.resolveInlineApproval.call({ready:async()=>{},conversations:service,approvals,approve} as any,id,old.id,approval.id,true);
  expect(approve).toHaveBeenCalledWith(approval.id,true);
  await expect(NexoCore.prototype.resolveInlineApproval.call({ready:async()=>{},conversations:service,approvals,approve} as any,service.createConversation().id,old.id,approval.id,true)).rejects.toThrow();
});

it("migrates an existing database without rewriting its messages",async()=>{
  seed(10);const original=service.getMessages(id);
  db.transaction(()=>{db.run("DROP INDEX idx_messages_conversation_cursor");db.run("DELETE FROM schema_migrations WHERE version=17");});
  const reopened=new NexoDatabase(root);await reopened.ready();
  expect(new ConversationService(reopened).getMessages(id)).toEqual(original);
  expect(reopened.get("SELECT version FROM schema_migrations WHERE version=17")).toEqual({version:17});
});
it("normalizes legacy approval risks to READ, WRITE and CRITICAL",()=>{
  const approvals=new ApprovalService(db),write=approvals.create("test",{},"WRITE","test"),critical=approvals.create("test",{},"CRITICAL","test");
  db.run("UPDATE approvals SET risk='SAFE_WRITE' WHERE id=?",[write.id]);db.run("UPDATE approvals SET risk='SENSITIVE' WHERE id=?",[critical.id]);
  expect(approvals.list("all").map(item=>item.risk)).toEqual(["CRITICAL","WRITE"]);
});
