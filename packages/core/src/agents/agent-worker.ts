export type AgentWorkerStatus = "idle"|"assigned"|"running"|"waiting_approval"|"completed"|"failed";
export class AgentWorker {
  readonly id:string;
  status:AgentWorkerStatus="idle";
  conversationId?:string;
  taskId?:string;
  runId?:string;
  lastAssignedAt=0;
  constructor(id:string){this.id=id;}
  assign(conversationId:string){this.conversationId=conversationId;this.status="assigned";this.lastAssignedAt=Date.now();return this;}
  start(taskId:string,runId:string){this.taskId=taskId;this.runId=runId;this.status="running";this.lastAssignedAt=Date.now();}
  wait(){this.status="waiting_approval";}
  finish(ok=true){this.taskId=undefined;this.runId=undefined;this.status=ok?"assigned":"failed";}
  release(){this.status="idle";this.conversationId=undefined;this.taskId=undefined;this.runId=undefined;}
  get busy(){return this.status==="running"||this.status==="waiting_approval";}
}
