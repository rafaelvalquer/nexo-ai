import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { ConversationService } from "../../packages/core/src/conversations/service";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder";
import { ChatActionService } from "../../packages/core/src/chat/actions/service";
import { AgentEngine } from "../../packages/core/src/agent/engine";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime";
import { ApprovalService } from "../../packages/core/src/permissions/approvals";
import { PermissionEngine } from "../../packages/core/src/permissions/policy";
import { AuditService } from "../../packages/core/src/audit/audit";
import type { ChatActionRequest, ResourceCollectionBlock } from "@nexo/shared";
let root:string, db:NexoDatabase, conversations:ConversationService, service:ChatActionService, approvals:ApprovalService, engine:AgentEngine, runtime:AgentRuntime, permissions:PermissionEngine, request:ChatActionRequest, collection:ResourceCollectionBlock;
const execute=vi.fn(async (_input:unknown)=>({ok:true,summary:"Alterado",data:undefined as unknown}));
const messages=Array.from({length:4},(_,index)=>({id:`provider-${index}`,subject:`Mensagem ${index}`,from:{email:"sender@example.com"},receivedAt:"2026-09-14T08:00:00Z",isUnread:true}));
beforeEach(async()=>{
  execute.mockReset();execute.mockResolvedValue({ok:true,summary:"Alterado",data:undefined});
  root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-actions-"));db=new NexoDatabase(root);await db.ready();
  conversations=new ConversationService(db);approvals=new ApprovalService(db);runtime=new AgentRuntime(db);permissions=new PermissionEngine(()=>({allowedRoots:[]} as any));
  const tools=new Map(["email_trash","email_archive","email_mark_read","email_mark_unread","email_bulk_trash","email_bulk_archive","email_bulk_mark_read","email_bulk_mark_unread","email_send_composed"].map(name=>[name,{name,description:name,risk:"SENSITIVE",permissions:[],mutatesState:true,inputSchema:z.record(z.unknown()),execute}]));
  tools.set("email_get",{name:"email_get",description:"Read",risk:"READ",permissions:[],mutatesState:false,inputSchema:z.record(z.unknown()),execute:async(input:any)=>({ok:true,summary:"Mensagem carregada",data:{...messages.find(message=>message.id===input.messageId),bodyText:"Corpo completo"}})});
  engine=new AgentEngine({observe:()=>({}),plan:()=>{throw new Error("Unexpected Ollama call");}} as any,{get:(name:string)=>tools.get(name)} as any,permissions,approvals,new AuditService(db),undefined,runtime);
  service=new ChatActionService(db,conversations,engine,approvals,runtime,permissions);
  const presentation=new ChatPresentationBuilder().fromToolResult("email_search",{ok:true,summary:"4 mensagens",data:{messages}},{connectionId:"account"});
  const conversationId=conversations.defaultConversation().id;
  const message=conversations.addMessage(conversationId,"assistant","4 mensagens",undefined,[],presentation);
  collection=presentation.presentation.blocks[0] as ResourceCollectionBlock;
  request={conversationId,messageId:message.id,blockId:collection.id,itemId:collection.items[0].id,actionId:"email.trash"};
});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
it("a card creates an inline approval for its exact ID; confirmation mutates only that message",async()=>{
  const events:any[]=[];service.subscribe(event=>events.push(event));
  const pending=await service.execute(request);
  expect(execute).not.toHaveBeenCalled();expect(pending.approval?.affectedCount).toBe(1);
  expect(approvals.list()[0].input).toEqual({connectionId:"account",messageId:"provider-0"});
  expect(conversations.getMessages(request.conversationId)[0].blocks).toContainEqual(pending.approval);
  const result=await service.resolveApproval(pending.approval!.approvalId,true);
  expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][0]).toEqual({connectionId:"account",messageId:"provider-0"});
  expect(result.item).toMatchObject({state:"success",statusText:"Movido para a lixeira"});
  expect(events.at(-1)).toMatchObject({type:"chat.resource.updated",itemId:request.itemId,state:"success"});
});
it("cancel is non-mutating and a pending card rejects duplicate clicks",async()=>{
  const pending=await service.execute(request);
  await expect(service.execute(request)).rejects.toThrow("pendente");
  await service.resolveApproval(pending.approval!.approvalId,false);
  expect(execute).not.toHaveBeenCalled();
});
it("approval action ownership survives service reconstruction",async()=>{
  const pending=await service.execute(request);
  const reopened=new ChatActionService(db,new ConversationService(db),engine,approvals,runtime,permissions);
  expect(reopened.handlesApproval(pending.approval!.approvalId)).toBe(true);
  await reopened.resolveApproval(pending.approval!.approvalId,true);
  expect(execute).toHaveBeenCalledTimes(1);
});
it("selected three cards bind exactly three provider IDs, with per-item partial failure",async()=>{
  const selected=collection.items.slice(0,3).map(item=>item.id);
  const pending=await service.execute({...request,itemIds:selected});
  expect(approvals.list()[0].input).toEqual({connectionId:"account",messageIds:["provider-0","provider-1","provider-2"]});
  execute.mockResolvedValueOnce({ok:true,summary:"2 alterados",data:{requested:3,succeeded:2,failed:1,failures:[{messageId:"provider-1",error:"Falha no provedor"}]}});
  await service.resolveApproval(pending.approval!.approvalId,true);
  const block=conversations.getMessages(request.conversationId)[0].blocks![0] as ResourceCollectionBlock;
  expect(block.items.map(item=>item.state)).toEqual(["success","failed","success",undefined]);
});
it("reply binds recipient and requires preview approval before send",async()=>{
  const pending=await service.execute({...request,actionId:"email.reply",values:{bodyText:"Obrigado pelo retorno."}});
  expect(execute).not.toHaveBeenCalled();expect(pending.approval?.preview).toContain("Obrigado pelo retorno.");
  expect(approvals.list()[0].input).toMatchObject({to:[{email:"sender@example.com"}],subject:"Re: Mensagem 0"});
  await service.resolveApproval(pending.approval!.approvalId,true);
  expect(execute).toHaveBeenCalledTimes(1);
});
it("expansion updates the existing item without adding another message",async()=>{
  const result=await service.execute({...request,actionId:"email.expand"});
  expect(result.item?.resource).toMatchObject({kind:"email",messageId:"provider-0",bodyText:"Corpo completo"});
  expect(conversations.getMessages(request.conversationId)).toHaveLength(1);
});
it("rejects forged conversations, items, actions and renderer-supplied tool parameters",async()=>{
  await expect(service.execute({...request,conversationId:"another"})).rejects.toThrow("conversa");
  await expect(service.execute({...request,itemId:"provider-3"})).rejects.toThrow("Recurso");
  await expect(service.execute({...request,actionId:"email_delete_all"})).rejects.toThrow("disponível");
  await expect(service.execute({...request,input:{messageId:"provider-3"}})).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
