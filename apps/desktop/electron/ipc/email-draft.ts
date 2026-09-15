import { ipcMain } from "electron";
import type { EmailComposeDraftCancelRequest,EmailComposeDraftSubmitRequest,EmailComposeDraftUpdateRequest } from "@nexo/shared";
import type { NexoCore } from "@nexo/core";

function assertId(value:unknown){if(typeof value!=="string"||!value.trim())throw new Error("Identificador de rascunho inválido.");return value;}
function assertVersion(value:unknown){if(!Number.isInteger(value)||Number(value)<1)throw new Error("Versão de rascunho inválida.");return Number(value);}

export function registerEmailDraftIpc(core:NexoCore){
  ipcMain.handle("nexo:email-draft:get",async(_event,draftId:unknown)=>{await core.ready();return getOrMaterializeDraft(core,assertId(draftId));});
  ipcMain.handle("nexo:email-draft:update",async(_event,request:EmailComposeDraftUpdateRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Atualização de rascunho inválida.");return core.agent.updateEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion),request.patch??{});});
  ipcMain.handle("nexo:email-draft:cancel",async(_event,request:EmailComposeDraftCancelRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Cancelamento de rascunho inválido.");const draft=core.agent.cancelEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion));if(draft.taskId)core.tasks.cancel(draft.taskId);return draft;});
  ipcMain.handle("nexo:email-draft:submit",async(_event,request:EmailComposeDraftSubmitRequest)=>{await core.ready();if(!request||typeof request!=="object")throw new Error("Envio de rascunho inválido.");const draft=await core.agent.submitEmailDraft(assertId(request.draftId),assertVersion(request.expectedVersion));if(draft.taskId){const task=core.tasks.get(draft.taskId);if(task?.status==="waiting_review")core.tasks.complete(draft.taskId,{draftId:draft.id,status:"sent"});}return draft;});
}

async function getOrMaterializeDraft(core:NexoCore,draftId:string){
  const existing=core.agentRuntime.emailDrafts.get(draftId);
  if(existing)return existing;

  const approval=core.approvals.list("all").find(item=>item.id===draftId);
  if(!approval||approval.toolName!=="email_send_composed")throw new Error("Rascunho de e-mail não encontrado.");
  if(approval.status!=="pending")throw new Error("Esta confirmação de envio não está mais disponível para edição.");

  const loopState=approval.checkpointId?core.agentRuntime.loadLoopState(approval.checkpointId):undefined;
  const taskId=approval.taskId??loopState?.taskId;
  const task=taskId?core.tasks.get(taskId):undefined;
  const conversationId=task?.conversationId??loopState?.conversationId;
  if(!conversationId)throw new Error("Não foi possível vincular o rascunho à conversa atual.");

  const input=approval.input??{};
  const to=Array.isArray(input.to)?input.to.flatMap(item=>{
    if(!item||typeof item!=="object")return[];
    const email=(item as {email?:unknown}).email;
    return typeof email==="string"&&email.trim()?[email.trim()]:[];
  }):[];
  const connectionId=typeof input.connectionId==="string"?input.connectionId:undefined;
  const subject=typeof input.subject==="string"?input.subject:"";
  const bodyText=typeof input.bodyText==="string"?input.bodyText:"";
  const draft=core.agentRuntime.emailDrafts.createWithId(draftId,{conversationId,taskId,connectionId,to,subject,bodyText});

  // The original exact-action approval is intentionally invalidated before the
  // user edits anything. The Send button later creates and approves a fresh
  // preflight action from the frozen edited draft.
  if(loopState){
    loopState.pendingAction=undefined;
    loopState.status="CANCELLED";
    loopState.finalResponse="Envio convertido em rascunho editável.";
    loopState.updatedAt=new Date().toISOString();
    core.agentRuntime.finishLoop(loopState.runId,loopState);
  }else if(approval.checkpointId){
    core.agentRuntime.cancelCheckpoint(approval.checkpointId,"Envio convertido em rascunho editável.");
  }
  core.approvals.resolve(approval.id,false);

  if(taskId){
    core.tasks.markWaitingReview(taskId,draft.id);
    core.scheduler.completeRun(taskId,true);
  }
  return draft;
}
