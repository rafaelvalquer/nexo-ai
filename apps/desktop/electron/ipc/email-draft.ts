import { ipcMain } from "electron";
import type { EmailComposeDraftCancelRequest,EmailComposeDraftSubmitRequest,EmailComposeDraftUpdateRequest } from "@nexo/shared";
import type { NexoCore } from "@nexo/core";

function assertId(value:unknown){if(typeof value!=="string"||!value.trim())throw new Error("Identificador de rascunho inválido.");return value;}
function assertVersion(value:unknown){if(!Number.isInteger(value)||Number(value)<1)throw new Error("Versão de rascunho inválida.");return Number(value);}

export function registerEmailDraftIpc(core:NexoCore){
  ipcMain.handle("nexo:email-draft:get",async(_event,draftId:unknown)=>{await core.ready();return core.agent.getEmailDraft(assertId(draftId));});
  ipcMain.handle("nexo:email-draft:update",async(_event,request:EmailComposeDraftUpdateRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Atualização de rascunho inválida.");return core.agent.updateEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion),request.patch??{});});
  ipcMain.handle("nexo:email-draft:cancel",async(_event,request:EmailComposeDraftCancelRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Cancelamento de rascunho inválido.");const draft=core.agent.cancelEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion));if(draft.taskId)core.tasks.cancel(draft.taskId);return draft;});
  ipcMain.handle("nexo:email-draft:submit",async(_event,request:EmailComposeDraftSubmitRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Envio de rascunho inválido.");const draft=await core.agent.submitEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion));if(draft.taskId){const task=core.tasks.get(draft.taskId);if(task?.status==="waiting_review")core.tasks.complete(draft.taskId,{draftId:draft.id,status:"sent"});}return draft;});
}
