import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach,afterEach,expect,it,vi } from "vitest";
import type { ChatActionRequest,ResourceCollectionBlock } from "@nexo/shared";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { ConversationService } from "../../packages/core/src/conversations/service";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder";
import { ChatActionService } from "../../packages/core/src/chat/actions/service";
import { AgentEngine } from "../../packages/core/src/agent/engine";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime";
import { ApprovalService } from "../../packages/core/src/permissions/approvals";
import { PermissionEngine } from "../../packages/core/src/permissions/policy";
import { SecurityPolicyService } from "../../packages/core/src/security/policy";
import { AuditService } from "../../packages/core/src/audit/audit";
import { filesystemTools } from "../../packages/core/src/tools/filesystem";
import { calendarTools } from "../../packages/core/src/tools/calendar";
let root:string,files:string,db:NexoDatabase,service:ChatActionService,approvals:ApprovalService,conversations:ConversationService,engine:AgentEngine,request:ChatActionRequest,settings:any;
const trash=vi.fn(async()=>({ok:true,summary:"Movido para lixeira"}));
const calendarDelete=vi.fn(async()=>({})),calendarUpdate=vi.fn(async()=>({})),calendarRsvp=vi.fn(async()=>({}));
const event={id:"event-1",calendarId:"calendar-1",title:"Daily",start:"2026-09-14T10:00:00Z",end:"2026-09-14T10:30:00Z",meetingUrl:"https://example.com/meeting"};
beforeEach(async()=>{
  vi.clearAllMocks();root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-file-card-db-"));files=fs.mkdtempSync(path.join(process.cwd(),".nexo-chat-test-"));
  fs.writeFileSync(path.join(files,"report.txt"),"Conteúdo original");
  db=new NexoDatabase(root);await db.ready();conversations=new ConversationService(db);approvals=new ApprovalService(db);const runtime=new AgentRuntime(db);
  settings={allowedRoots:[files],allowedDomains:[],fileWritesEnabled:true,connectionsEnabled:true,browserAutomationEnabled:true};
  const permissions=new PermissionEngine(()=>settings),security=new SecurityPolicyService(()=>settings);
  const tools=new Map([...filesystemTools(),...calendarTools({delete:calendarDelete,update:calendarUpdate,rsvp:calendarRsvp,get:async()=>event} as any)].map(tool=>[tool.name,tool]));
  tools.set("trash_file",{...tools.get("trash_file")!,execute:trash});
  engine=new AgentEngine({observe:()=>({})} as any,{get:(name:string)=>tools.get(name)} as any,permissions,approvals,new AuditService(db),undefined,runtime,security);
  service=new ChatActionService(db,conversations,engine,approvals,runtime,permissions);
  request=save("list_files",[{name:"report.txt",path:path.join(files,"report.txt"),type:"file"}],"file.rename");
});
afterEach(()=>{fs.rmSync(root,{recursive:true,force:true});if(!path.resolve(files).startsWith(path.resolve(process.cwd())+path.sep+".nexo-chat-test-"))throw new Error("Unsafe test cleanup");fs.rmSync(files,{recursive:true,force:true});});
function save(tool:string,data:unknown,actionId:string){const record=new ChatPresentationBuilder().fromToolResult(tool,{ok:true,summary:"Resultado",data},{connectionId:"7a73e69e-0dc6-4433-8cfe-fb3cfa7ad956"});const conversationId=conversations.defaultConversation().id,message=conversations.addMessage(conversationId,"assistant","Resultado",undefined,[],record),block=record.presentation.blocks[0] as ResourceCollectionBlock;return{conversationId,messageId:message.id,blockId:block.id,itemId:block.items[0].id,actionId};}
it("lists real file sizes and previews text inline",async()=>{
  const result=await engine.runPlan("Listar",[{tool:"list_files",input:{path:files}}]);
  expect(result.result?.data).toEqual(expect.arrayContaining([expect.objectContaining({name:"report.txt",size:Buffer.byteLength("Conteúdo original")})]));
  const preview=await service.execute({...request,actionId:"file.preview"});expect(preview.preview).toEqual({kind:"text",content:"Conteúdo original"});
});
it.each(["md","csv","json"])("previews %s files as text without executing their content",async extension=>{
  const name=`preview.${extension}`,content='{"message":"conteúdo de teste"}';fs.writeFileSync(path.join(files,name),content);
  const selected=save("list_files",[{name,path:path.join(files,name),type:"file"}],"file.preview");
  expect((await service.execute(selected)).preview).toEqual({kind:"text",content});
});
it.each([["png","image","image/png"],["pdf","pdf","application/pdf"]])("returns %s previews and an exact external-open action",async(extension,kind,mime)=>{
  const name=`preview.${extension}`,bytes=Buffer.from(extension==="pdf"?"%PDF-1.4\n%%EOF":"image fixture");fs.writeFileSync(path.join(files,name),bytes);
  const selected=save("list_files",[{name,path:path.join(files,name),type:"file"}],"file.preview");
  expect((await service.execute(selected)).preview).toEqual({kind,content:`data:${mime};base64,${bytes.toString("base64")}`});
  expect((await service.execute({...selected,actionId:"file.open"})).openPath).toBe(path.join(files,name));
});
it("opens an unsupported preview externally using the persisted path",async()=>{
  const name="document.bin";fs.writeFileSync(path.join(files,name),"binary fixture");
  const selected=save("list_files",[{name,path:path.join(files,name),type:"file"}],"file.preview");
  expect(await service.execute(selected)).toMatchObject({openPath:path.join(files,name)});
});
it("renames only after approval and updates the card binding for later actions",async()=>{
  const pending=await service.execute({...request,values:{newName:"renamed.txt"}});
  expect(fs.existsSync(path.join(files,"report.txt"))).toBe(true);expect(fs.existsSync(path.join(files,"renamed.txt"))).toBe(false);
  const result=await service.resolveApproval(pending.approval!.approvalId,true);
  expect(result.item?.resource).toMatchObject({name:"renamed.txt",path:path.join(files,"renamed.txt")});
  expect(fs.existsSync(path.join(files,"report.txt"))).toBe(false);
  expect((await service.execute({...request,actionId:"file.preview"})).preview?.content).toBe("Conteúdo original");
});
it("changed file metadata invalidates the preflight before mutation",async()=>{
  const pending=await service.execute({...request,actionId:"file.trash"});fs.appendFileSync(path.join(files,"report.txt")," Alterado");
  await expect(service.resolveApproval(pending.approval!.approvalId,true)).rejects.toThrow("mudou desde a prévia");expect(trash).not.toHaveBeenCalled();
  await service.resolveApproval(pending.approval!.approvalId,false);
});
it("refuses to overwrite an existing destination",async()=>{
  fs.writeFileSync(path.join(files,"existing.txt"),"Preservar");
  await expect(service.execute({...request,values:{newName:"existing.txt"}})).rejects.toThrow("Já existe");
  expect(approvals.list()).toHaveLength(0);expect(fs.readFileSync(path.join(files,"existing.txt"),"utf8")).toBe("Preservar");
});
it("revalidates a destination created after approval preview",async()=>{
  const pending=await service.execute({...request,values:{newName:"reserved.txt"}});
  fs.writeFileSync(path.join(files,"reserved.txt"),"Outro arquivo");
  await expect(service.resolveApproval(pending.approval!.approvalId,true)).rejects.toThrow("Já existe");
  expect(fs.existsSync(path.join(files,"report.txt"))).toBe(true);expect(fs.readFileSync(path.join(files,"reserved.txt"),"utf8")).toBe("Outro arquivo");
});
it("does not allow a destination junction to escape allowed roots",async()=>{
  const outside=fs.mkdtempSync(path.join(process.cwd(),".nexo-chat-test-denied-"));
  try{
    fs.symlinkSync(outside,path.join(files,"junction"),process.platform==="win32"?"junction":"dir");
    await expect(service.execute({...request,actionId:"file.move",values:{destination:path.join(files,"junction")}})).rejects.toThrow("fora do escopo");
    expect(approvals.list()).toHaveLength(0);expect(fs.existsSync(path.join(files,"report.txt"))).toBe(true);
  }finally{if(!path.resolve(outside).startsWith(path.resolve(process.cwd())+path.sep+".nexo-chat-test-denied-"))throw new Error("Unsafe test cleanup");fs.rmSync(outside,{recursive:true,force:true});}
});
it("file trash uses the exact path and respects a policy disabled after preview",async()=>{
  const pending=await service.execute({...request,actionId:"file.trash"});expect(approvals.list()[0].input).toEqual({path:path.join(files,"report.txt")});
  settings.fileWritesEnabled=false;
  const result=await service.resolveApproval(pending.approval!.approvalId,true);expect(result.item?.state).toBe("failed");expect(trash).not.toHaveBeenCalled();
});
it("folder listing persists a child collection with its own resource bindings",async()=>{
  const folder=save("list_files",[{name:"Pasta",path:files,type:"directory"}],"folder.list");
  const result=await service.execute(folder);expect(result.block?.items[0].resource).toMatchObject({kind:"file",name:"report.txt"});
  const child=result.block!.items[0];
  const preview=await service.execute({...folder,blockId:result.block!.id,itemId:child.id,actionId:"file.preview"});expect(preview.preview?.content).toBe("Conteúdo original");
});
it("calendar deletion and editing bind the exact event and require approval",async()=>{
  const calendar=save("calendar_list",[event],"calendar.edit");
  const pending=await service.execute({...calendar,values:{title:"Daily atualizada"}});expect(calendarUpdate).not.toHaveBeenCalled();
  const result=await service.resolveApproval(pending.approval!.approvalId,true);expect(result.item?.resource).toMatchObject({eventId:"event-1",title:"Daily atualizada"});
  expect(calendarUpdate.mock.calls[0][1]).toBe("event-1");
  const deletion=await service.execute({...calendar,actionId:"calendar.delete"});await service.resolveApproval(deletion.approval!.approvalId,false);expect(calendarDelete).not.toHaveBeenCalled();
});
it("calendar RSVP requires approval and joining uses a freshly validated URL",async()=>{
  const calendar=save("calendar_list",[event],"calendar.rsvp");
  const pending=await service.execute({...calendar,values:{response:"tentative"}});expect(calendarRsvp).not.toHaveBeenCalled();
  await service.resolveApproval(pending.approval!.approvalId,true);expect(calendarRsvp.mock.calls[0][2]).toBe("tentative");
  expect((await service.execute({...calendar,actionId:"calendar.join"})).openUrl).toBe(event.meetingUrl);
});
