import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {beforeEach,afterEach,expect,it} from "vitest";
import {NexoDatabase} from "../../packages/core/src/database/db";
import {BackgroundTaskService} from "../../packages/core/src/tasks/background";
import {ApprovalService} from "../../packages/core/src/permissions/approvals";
import type {ChatPresentation} from "@nexo/shared";
let root:string,db:NexoDatabase;
const presentation:ChatPresentation={version:1,blocks:[{id:"block",version:1,type:"text",content:"Detalhes da tarefa"}]};
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-task-presentation-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
it("restores the current presentation and approval when reopening a waiting task",()=>{
  const tasks=new BackgroundTaskService(db),task=tasks.create("assistant-chat",{});
  tasks.markRunning(task.id);tasks.setPresentation(task.id,presentation);tasks.markWaitingApproval(task.id,"approval");
  const reopened=new BackgroundTaskService(db);
  expect(reopened.get(task.id)).toMatchObject({presentation,pendingApprovalId:"approval",status:"waiting_approval"});
  reopened.setStatus(task.id,"Continua aguardando");
  expect(reopened.get(task.id)?.presentation).toEqual(presentation);
});
it("unknown versions and corrupt presentation payloads fall back without breaking task reads",()=>{
  const tasks=new BackgroundTaskService(db),task=tasks.create("assistant-chat",{});
  for(const value of [JSON.stringify({text:"Fallback",presentation:{version:2,blocks:[]}}),JSON.stringify({text:"Fallback",presentation:{version:1,blocks:[{type:"resource_collection"}]}}),"invalid json"]){
    db.run("UPDATE tasks SET progress_json=? WHERE id=?",[value,task.id]);
    const reopened=new BackgroundTaskService(db);
    expect(()=>reopened.listActive()).not.toThrow();expect(reopened.get(task.id)?.presentation).toBeUndefined();
  }
});
it("private task cards remain ephemeral and are absent after rebuilding the task service",()=>{
  const tasks=new BackgroundTaskService(db,()=>true),task=tasks.create("assistant-chat",{});
  tasks.markRunning(task.id);tasks.setPresentation(task.id,presentation);tasks.markWaitingApproval(task.id,"approval");
  expect(tasks.get(task.id)?.presentation).toEqual(presentation);
  expect(new BackgroundTaskService(db,()=>true).get(task.id)?.presentation).toBeUndefined();
  expect(db.get<{progress_json:string}>("SELECT progress_json FROM tasks WHERE id=?",[task.id])?.progress_json).not.toContain("Detalhes da tarefa");
});
it("resuming reflects approval resolution and clears the pending approval identity",()=>{
  const approvals=new ApprovalService(db),approval=approvals.create("test",{},"SENSITIVE","Confirmar");
  const tasks=new BackgroundTaskService(db),task=tasks.create("assistant-chat",{});
  tasks.markRunning(task.id);tasks.setPresentation(task.id,{version:1,blocks:[{id:"approval-block",version:1,type:"approval",approvalId:approval.id,title:"Confirmar",status:"pending"}]});tasks.markWaitingApproval(task.id,approval.id);
  approvals.resolve(approval.id,true);
  const reopened=new BackgroundTaskService(db);reopened.markRunning(task.id);
  expect(reopened.get(task.id)?.pendingApprovalId).toBeUndefined();
  expect(reopened.get(task.id)?.presentation?.blocks[0]).toMatchObject({status:"approved"});
});
