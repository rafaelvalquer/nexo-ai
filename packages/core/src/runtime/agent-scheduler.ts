import { randomUUID } from "node:crypto";
import type { BackgroundTask } from "@nexo/shared";
import type { LocalMetricsService } from "../observability/metrics.js";
import { AgentPool,MAX_CONCURRENT_CHAT_SESSIONS } from "../agents/agent-pool.js";

export type ScheduledAgentRun={runId:string;taskId:string;conversationId:string;agentId:string;startedAt:string;status:"running"|"waiting_approval"};
export class AgentScheduler{
  private runs=new Map<string,ScheduledAgentRun>();
  constructor(readonly pool:AgentPool,private metrics?:LocalMetricsService){}
  assignAgent(conversationId:string,taskId:string,maxConcurrent=MAX_CONCURRENT_CHAT_SESSIONS){
    const started=Date.now();const max=Math.max(1,Math.min(MAX_CONCURRENT_CHAT_SESSIONS,maxConcurrent));
    if(this.runs.size>=max)throw new Error(`O limite de ${max} execução(ões) simultânea(s) foi atingido. Aguarde uma tarefa terminar ou cancele uma execução.`);
    if([...this.runs.values()].some(run=>run.conversationId===conversationId))throw new Error("Este chat já possui uma tarefa em execução.");
    const worker=this.pool.assign(conversationId),runId=randomUUID();worker.start(taskId,runId);
    const run:ScheduledAgentRun={runId,taskId,conversationId,agentId:worker.id,startedAt:new Date().toISOString(),status:"running"};this.runs.set(taskId,run);
    this.metrics?.record("agent_pool.assignment_ms",Date.now()-started,{agent:worker.id});this.recordCounts();return run;
  }
  restore(task:BackgroundTask){if(!task.conversationId||!task.agentId||!task.runId)return;const worker=this.pool.workers.find(item=>item.id===task.agentId);if(!worker||worker.busy)return;worker.assign(task.conversationId);worker.start(task.id,task.runId);if(task.status==="waiting_approval")worker.wait();this.runs.set(task.id,{runId:task.runId,taskId:task.id,conversationId:task.conversationId,agentId:task.agentId,startedAt:task.startedAt??task.createdAt,status:task.status==="waiting_approval"?"waiting_approval":"running"});this.recordCounts();}
  waitingApproval(taskId:string){const run=this.runs.get(taskId);if(!run)return;run.status="waiting_approval";this.pool.workers.find(w=>w.id===run.agentId)?.wait();this.recordCounts();}
  resume(taskId:string){const run=this.runs.get(taskId);if(!run)return;run.status="running";const worker=this.pool.workers.find(w=>w.id===run.agentId);if(worker)worker.start(taskId,run.runId);this.recordCounts();return run;}
  completeRun(taskId:string,ok=true){const run=this.runs.get(taskId);if(!run)return;this.runs.delete(taskId);this.pool.workers.find(w=>w.id===run.agentId)?.finish(ok);this.metrics?.record("chat.run_duration_ms",Date.now()-Date.parse(run.startedAt),{agent:run.agentId,ok});this.recordCounts();}
  cancelRun(taskId:string){this.completeRun(taskId,false);}
  releaseConversation(conversationId:string){if([...this.runs.values()].some(run=>run.conversationId===conversationId))throw new Error("Não é possível fechar um chat enquanto ele executa uma tarefa.");this.pool.releaseConversation(conversationId);}
  getByTask(taskId:string){return this.runs.get(taskId);}
  getByConversation(conversationId:string){return[...this.runs.values()].find(run=>run.conversationId===conversationId);}
  activeRuns(){return[...this.runs.values()];}
  private recordCounts(){this.metrics?.record("agent_pool.active",this.runs.size);this.metrics?.record("agent_pool.queued",0);this.metrics?.record("chat.concurrent_sessions",this.runs.size);}
}
