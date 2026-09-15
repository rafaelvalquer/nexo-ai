import { createHash, randomUUID } from "node:crypto";
import type { Approval, RiskLevel } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import type { LocalMetricsService } from "../observability/metrics.js";

export type ApprovalMetadata={domain?:string;actionType?:string;preview?:string;affectedCount?:number;consequence?:string;expiresInMs?:number};

export class ApprovalService {
  constructor(private db: NexoDatabase,private readonly metrics?:LocalMetricsService) { this.ensureColumns(); }

  create(toolName:string,input:Record<string,unknown>,risk:RiskLevel,reason:string,run?:{agentRunId:string;checkpointId:string;visualRunId?:string;taskId?:string;executionId?:string},metadata:ApprovalMetadata={}):Approval {
    const createdAt=new Date().toISOString();
    const expiresAt=new Date(Date.now()+(metadata.expiresInMs??(risk==="CRITICAL"?5*60_000:10*60_000))).toISOString();
    const fingerprint=fingerprintFor(toolName,input);
    const approval:Approval={id:randomUUID(),createdAt,toolName,input,risk,reason,status:"pending",...run,executionId:run?.executionId??randomUUID(),domain:metadata.domain,actionType:metadata.actionType,preview:metadata.preview,affectedCount:metadata.affectedCount,consequence:metadata.consequence,fingerprint,expiresAt};
    this.db.run("INSERT INTO approvals(id,tool_name,input_json,risk,reason,status,created_at,agent_run_id,checkpoint_id,visual_run_id,task_id,action_type,domain,preview,affected_count,consequence,fingerprint,execution_id,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[approval.id,toolName,JSON.stringify(input),risk,reason,approval.status,createdAt,approval.agentRunId??null,approval.checkpointId??null,approval.visualRunId??null,approval.taskId??null,approval.actionType??null,approval.domain??null,approval.preview??null,approval.affectedCount??null,approval.consequence??null,fingerprint,approval.executionId,expiresAt]);
    this.metrics?.record("agent.approval_requested",1,{tool:toolName,risk});
    return approval;
  }

  list(status:Approval["status"]|"all"="pending"):Approval[] {
    this.expirePending();
    const rows=status==="all"?this.db.all<any>("SELECT * FROM approvals ORDER BY created_at DESC"):this.db.all<any>("SELECT * FROM approvals WHERE status=? ORDER BY created_at DESC",[status]);
    return rows.map(row=>this.map(row));
  }

  resolve(id:string,approved:boolean) {
    this.expirePending();
    const row=this.db.get<any>("SELECT * FROM approvals WHERE id=?",[id]);
    if(!row)return undefined;
    if(row.status!=="pending")throw new Error(row.status==="expired"?"A aprovação expirou. Gere uma nova prévia antes de executar a alteração.":"Esta aprovação já foi resolvida.");
    if(approved){
      if(row.expires_at&&Date.parse(row.expires_at)<=Date.now()){this.db.run("UPDATE approvals SET status='expired' WHERE id=?",[id]);throw new Error("A aprovação expirou. Gere uma nova prévia antes de executar a alteração.");}
      const input=JSON.parse(row.input_json) as Record<string,unknown>;
      const current=fingerprintFor(row.tool_name,input);
      if(row.fingerprint&&current!==row.fingerprint){this.db.run("UPDATE approvals SET status='expired' WHERE id=?",[id]);throw new Error("A ação mudou desde a confirmação. Gere uma nova prévia e confirme novamente.");}
    }
    this.db.run("UPDATE approvals SET status=? WHERE id=?",[approved?"approved":"rejected",id]);
    this.metrics?.record(approved?"agent.approval_approved":"agent.approval_rejected",1,{tool:row.tool_name});
    return this.db.get<any>("SELECT * FROM approvals WHERE id=?",[id]);
  }

  linkVisualContext(id:string,context:{visualRunId:string;taskId?:string}){this.db.run("UPDATE approvals SET visual_run_id=?,task_id=? WHERE id=?",[context.visualRunId,context.taskId??null,id]);}

  assertCheckpointApproved(checkpointId:string) {
    const approval=this.db.get<{status:string;tool_name:string;input_json:string;fingerprint:string;expires_at:string|null}>("SELECT status,tool_name,input_json,fingerprint,expires_at FROM approvals WHERE checkpoint_id=?",[checkpointId]);
    const checkpoint=this.db.get<{state_json:string;status:string}>("SELECT state_json,status FROM agent_checkpoints WHERE id=?",[checkpointId]);
    if(!approval||approval.status!=="approved"||checkpoint?.status!=="WAITING_APPROVAL")throw new Error("Checkpoint não possui aprovação válida ou já foi executado.");
    if(approval.expires_at&&Date.parse(approval.expires_at)<=Date.now())throw new Error("A aprovação expirou antes da execução.");
    const state=JSON.parse(checkpoint.state_json) as {nextStep:number;steps:{tool:string;input:Record<string,unknown>}[]};
    const step=state.steps[state.nextStep];
    if(!step||step.tool!==approval.tool_name||fingerprintFor(step.tool,step.input)!==approval.fingerprint||fingerprintFor(approval.tool_name,JSON.parse(approval.input_json))!==approval.fingerprint)throw new Error("O plano mudou desde a aprovação. Gere uma nova prévia.");
  }

  private map(row:any):Approval{return{id:row.id,toolName:row.tool_name,input:JSON.parse(row.input_json),risk:row.risk,reason:row.reason,status:row.status,createdAt:row.created_at,agentRunId:row.agent_run_id??undefined,checkpointId:row.checkpoint_id??undefined,visualRunId:row.visual_run_id??undefined,taskId:row.task_id??undefined,domain:row.domain??undefined,actionType:row.action_type??undefined,preview:row.preview??undefined,affectedCount:row.affected_count??undefined,consequence:row.consequence??undefined,fingerprint:row.fingerprint??undefined,executionId:row.execution_id??undefined,expiresAt:row.expires_at??undefined};}
  private expirePending(){const now=new Date().toISOString(),expired=this.db.all<{tool_name:string}>("SELECT tool_name FROM approvals WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=?",[now]);this.db.run("UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=?",[now]);for(const item of expired)this.metrics?.record("agent.approval_expired",1,{tool:item.tool_name});}
  private ensureColumns(){const columns=new Set(this.db.all<{name:string}>("PRAGMA table_info(approvals)").map(column=>String(column.name)));const additions:[string,string][]=[["action_type","TEXT"],["domain","TEXT"],["preview","TEXT"],["affected_count","INTEGER"],["consequence","TEXT"],["fingerprint","TEXT"],["execution_id","TEXT"],["expires_at","TEXT"]];for(const[name,type]of additions)if(!columns.has(name))this.db.run(`ALTER TABLE approvals ADD COLUMN ${name} ${type}`);}
}

export function fingerprintFor(toolName:string,input:Record<string,unknown>){return createHash("sha256").update(`${toolName}\n${canonicalJson(JSON.parse(JSON.stringify(input)))}`).digest("hex");}
function canonicalJson(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonicalJson).join(",")}]`;const object=value as Record<string,unknown>;return`{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;}
