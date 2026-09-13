import { AgentWorker } from "./agent-worker.js";
export const MAX_CONCURRENT_CHAT_SESSIONS=4;
export class AgentPool {
  readonly workers=Array.from({length:MAX_CONCURRENT_CHAT_SESSIONS},(_,index)=>new AgentWorker(`agent-${index+1}`));
  assignedTo(conversationId:string){return this.workers.find(worker=>worker.conversationId===conversationId);}
  assign(conversationId:string){
    const existing=this.assignedTo(conversationId);if(existing&&!existing.busy)return existing;
    const free=this.workers.find(worker=>worker.status==="idle")??this.workers.filter(worker=>!worker.busy).sort((a,b)=>a.lastAssignedAt-b.lastAssignedAt)[0];
    if(!free)throw new Error("Os 4 agentes estão ocupados. Aguarde uma tarefa terminar ou cancele uma execução.");
    if(free.conversationId&&free.conversationId!==conversationId)free.release();
    return free.assign(conversationId);
  }
  releaseConversation(conversationId:string){this.assignedTo(conversationId)?.release();}
  active(){return this.workers.filter(worker=>worker.busy);}
  snapshot(){return this.workers.map(worker=>({id:worker.id,status:worker.status,conversationId:worker.conversationId,taskId:worker.taskId,runId:worker.runId}));}
}
