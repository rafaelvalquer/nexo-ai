import type {NexoDatabase} from "../../database/db.js";
import type {AgentRuntime} from "./runtime.js";

/** Reconciles durable task/run state before the scheduler and agent resume work. */
export class RuntimeRecoveryCoordinator{
  constructor(private readonly db:NexoDatabase,private readonly runtime:AgentRuntime){}
  recover(){
    const states=this.runtime.recoverableLoops();
    for(const state of states){
      if(!state.taskId)continue;
      const status=state.status==="WAITING_APPROVAL"?"waiting_approval":"running";
      const message=state.status==="RESULT_UNKNOWN"?"Resultado desconhecido; aguardando reconciliação segura.":state.status==="WAITING_APPROVAL"?"Aguardando sua aprovação…":"Retomando execução interrompida…";
      this.db.run("UPDATE tasks SET status=?,error=NULL,finished_at=NULL,progress_json=? WHERE id=? AND status IN ('queued','running','failed','waiting_approval')",[status,JSON.stringify({text:"",statusMessage:message,statusHistory:[message]}),state.taskId]);
    }
    const activeRunIds=new Set(states.map(state=>state.runId));const now=new Date().toISOString();
    for(const task of this.db.all<{id:string;run_id:string|null}>("SELECT id,run_id FROM tasks WHERE status IN ('queued','running')"))if(!task.run_id||!activeRunIds.has(task.run_id))this.db.run("UPDATE tasks SET status='failed',error=?,finished_at=? WHERE id=?",["A tarefa não possui uma run recuperável consistente.",now,task.id]);
    return states;
  }
}
