import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";

export function registerIpc(core:NexoCore,desktop:{chooseFolder:()=>Promise<string|null>;openPath:(p:string)=>Promise<string>;openExternal:(u:string)=>Promise<void>;trashItem:(p:string)=>Promise<void>}){
  ipcMain.handle("nexo:chat",(_,text)=>core.chat(text));
  ipcMain.handle("nexo:chat:start",(_,text)=>core.startChatTask(text));
  ipcMain.handle("nexo:chat:history",()=>core.listChatMessages());
  ipcMain.handle("nexo:tasks:list",(_,limit)=>core.listTasks(limit));
  ipcMain.handle("nexo:tasks:active",()=>core.listActiveTasks());
  ipcMain.handle("nexo:task:get",(_,id)=>core.getTask(id));
  ipcMain.handle("nexo:status",()=>core.status());
  ipcMain.handle("nexo:settings:get",()=>core.getSettings());
  ipcMain.handle("nexo:settings:update",(_,patch)=>core.updateSettings(patch));
  ipcMain.handle("nexo:approvals:list",()=>core.approvals.list());
  ipcMain.handle("nexo:approvals:resolve",(_,id,approved)=>core.approve(id,approved));
  ipcMain.handle("nexo:audit:list",()=>core.audit.list());
  ipcMain.handle("nexo:memory:list",()=>core.memory.listByCategory());
  ipcMain.handle("nexo:memory:add",(_,key,value,category)=>core.addMemory(key,value,category));
  ipcMain.handle("nexo:memory:search",(_,query)=>core.memory.search(query));
  ipcMain.handle("nexo:memory:remove",(_,key)=>core.memory.remove(key));
  ipcMain.handle("nexo:automation:list",()=>core.automation.list());
  ipcMain.handle("nexo:automation:create",(_,data)=>core.automation.create(data));
  ipcMain.handle("nexo:automation:toggle",(_,id,enabled)=>core.automation.setEnabled(id,enabled));
  ipcMain.handle("nexo:automation:remove",(_,id)=>core.automation.remove(id));
  ipcMain.handle("nexo:choose-folder",()=>desktop.chooseFolder());
  ipcMain.handle("nexo:open-path",(_,p)=>desktop.openPath(p));
  ipcMain.handle("nexo:open-external",(_,u)=>desktop.openExternal(u));
  ipcMain.handle("nexo:trash-item",async(_,p)=>{core.permissions.assertPath(p);const approval=core.approvals.create("trash_file",{path:p},"CRITICAL","Mover item para a lixeira");return approval;});
  ipcMain.handle("nexo:backup",()=>core.backup());
}
