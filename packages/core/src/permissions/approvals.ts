import { createHash, randomUUID } from "node:crypto";
import type { Approval, RiskLevel } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";

export type ApprovalMetadata={domain?:string;actionType?:string;preview?:string;affectedCount?:number;consequence?:string;expiresInMs?:number};

export class ApprovalService {
  constructor(private db: NexoDatabase) { this.ensureColumns(); }

  create(toolName:string,input:Record<string,unknown>,risk:RiskLevel,reason:string,run?:{agentRunId:string;checkpointId:string;visualRunId?:string;taskId?:string},metadata:ApprovalMetadata={}):Approval {
    const createdAt=new Date().toISOString();
    const expiresAt=new Date(Date.now()+(metadata.expiresInMs??(risk==="CRITICAL"?5*60_000:10*60_000))).toISOString();
    const fingerprint=fingerprintFor(toolName,input);
    const approval:Approval={id:randomUUID(),createdAt,toolName,input,risk,reason,status:"pending",...run,domain:metadata.domain,actionType:metadata.actionType,preview:metadata.preview,affectedCount:metadata.affectedCount,consequence:metadata.consequence,fingerprint,expiresAt};
    this.db.run("INSERT INTO approvals(id,tool_name,input_json,risk,reason,status,created_at,agent_run_id,checkpoint_id,visual_run_id,task_id,action_type,domain,preview,affected_count,consequence,fingerprint,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[approval.id,toolName,JSON.stringify(input),risk,reason,approval.status,createdAt,approval.agentRunId??null,approval.checkpointId??null,approval.visualRunId??null,approval.taskId??null,approval.actionType??null,approval.domain??null,approval.preview??null,approval.affectedCount??null,approval.consequence??null,fingerprint,expiresAt]);
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
    return this.db.get<any>("SELECT * FROM approvals WHERE id=?",[id]);
  }

  linkVisualContext(id:string,context:{visualRunId:string;taskId?:string}){this.db.run("UPDATE approvals SET visual_run_id=?,task_id=? WHERE id=?",[context.visualRunId,context.taskId??null,id]);}

  private map(row:any):Approval{return{id:row.id,toolName:row.tool_name,input:JSON.parse(row.input_json),risk:row.risk,reason:row.reason,status:row.status,createdAt:row.created_at,agentRunId:row.agent_run_id??undefined,checkpointId:row.checkpoint_id??undefined,visualRunId:row.visual_run_id??undefined,taskId:row.task_id??undefined,domain:row.domain??undefined,actionType:row.action_type??undefined,preview:row.preview??undefined,affectedCount:row.affected_count??undefined,consequence:row.consequence??undefined,fingerprint:row.fingerprint??undefined,expiresAt:row.expires_at??undefined};}
  private expirePending(){this.db.run("UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=?",[new Date().toISOString()]);}
  private ensureColumns(){const columns=new Set(this.db.all<{name:string}>("PRAGMA table_info(approvals)").map(column=>String(column.name)));const additions:[string,string][]=[["action_type","TEXT"],["domain","TEXT"],["preview","TEXT"],["affected_count","INTEGER"],["consequence","TEXT"],["fingerprint","TEXT"],["expires_at","TEXT"]];for(const[name,type]of additions)if(!columns.has(name))this.db.run(`ALTER TABLE approvals ADD COLUMN ${name} ${type}`);}
}

export function fingerprintFor(toolName:string,input:Record<string,unknown>){return createHash("sha256").update(`${toolName}\n${canonicalJson(input)}`).digest("hex");}
function canonicalJson(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonicalJson).join(",")}]`;const object=value as Record<string,unknown>;return`{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;}
