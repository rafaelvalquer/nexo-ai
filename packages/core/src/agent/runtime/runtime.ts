import { randomUUID } from "node:crypto";
import type { ToolResult } from "@nexo/shared";
import type { NexoDatabase } from "../../database/db.js";
import { LocalMetricsService } from "../../observability/metrics.js";
import { EmailSearchPreferenceRepository } from "../../email/preferences/repository.js";
import { EmailSearchPreferenceService } from "../../email/preferences/service.js";
import { EmailComposeDraftRepository } from "../../email/compose/draft-repository.js";
import { EmailComposeDraftService } from "../../email/compose/draft-service.js";
import type { ConversationActionContextState } from "../context/conversation-action-context.js";
import { configureDefaultIntentLearning, type PlanStep } from "../planner.js";
import { IntentMemoryStore } from "../intent-memory/store.js";
import type { PendingClarification } from "../clarification/types.js";
import type { AgentRun, AgentRunStatus, PersistedAgentState } from "./state.js";
import type { AgentLoopState } from "../loop/types.js";

type RunRow={id:string;status:AgentRunStatus;state_json:string;final_response:string|null;created_at:string;updated_at:string;conversation_id?:string|null;task_id?:string|null;agent_id?:string|null};
type ClarificationRow={id:string;conversation_id:string;domain:PendingClarification["domain"];intent:string;operation:string;original_request:string;partial_entities_json:string;questions_json:string;intent_json:string;values_json:string;status:PendingClarification["status"];created_at:string;resolved_at:string|null;expires_at:string|null};
export type AgentRuntimeContext={conversationId?:string;taskId?:string;agentId?:string};
export class AgentRuntime{
  private readonly intentMemory:IntentMemoryStore;
  readonly emailPreferences:EmailSearchPreferenceService;
  readonly emailDrafts:EmailComposeDraftService;
  constructor(private db:NexoDatabase){
    this.intentMemory=new IntentMemoryStore(db);
    this.emailPreferences=new EmailSearchPreferenceService(new EmailSearchPreferenceRepository(db));
    this.emailDrafts=new EmailComposeDraftService(new EmailComposeDraftRepository(db));
    this.ensureClarificationSchema();
    configureDefaultIntentLearning(this.intentMemory,()=>this.intentLearningEnabled(),new LocalMetricsService(db));
  }
  start(userRequest:string,steps:PlanStep[],context:AgentRuntimeContext={},metadata:Partial<Pick<PersistedAgentState,"intent"|"deferredAction"|"responseMode">>={}):AgentRun{const id=randomUUID(),now=new Date().toISOString(),state:PersistedAgentState={userRequest,steps,nextStep:0,results:[],iteration:0,...metadata};this.db.run("INSERT INTO agent_runs(id,user_request,status,state_json,created_at,updated_at,conversation_id,task_id,agent_id) VALUES(?,?,?,?,?,?,?,?,?)",[id,userRequest,"RUNNING",JSON.stringify(state),now,now,context.conversationId??null,context.taskId??null,context.agentId??null]);return{id,status:"RUNNING",state,createdAt:now,updatedAt:now};}
  get(id:string){const row=this.db.get<RunRow>("SELECT * FROM agent_runs WHERE id=?",[id]);return row&&this.toRun(row);}
  saveState(id:string,state:PersistedAgentState,status:AgentRunStatus="RUNNING"){this.db.run("UPDATE agent_runs SET state_json=?,status=?,updated_at=? WHERE id=?",[JSON.stringify(state),status,new Date().toISOString(),id]);}
  recordStep(runId:string,ordinal:number,step:PlanStep,status:"RUNNING"|"COMPLETED"|"FAILED",result?:ToolResult,error?:string){const id=randomUUID(),now=new Date().toISOString();this.db.run("INSERT INTO agent_steps(id,run_id,ordinal,tool_name,input_json,status,result_json,error,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[id,runId,ordinal,step.tool,JSON.stringify(step.input??{}),status,result?JSON.stringify(result):null,error??null,now,status==="RUNNING"?null:now]);}
  checkpoint(runId:string,state:PersistedAgentState){const id=randomUUID(),now=new Date().toISOString();this.db.run("INSERT INTO agent_checkpoints(id,run_id,state_json,status,created_at) VALUES(?,?,?,?,?)",[id,runId,JSON.stringify(state),"WAITING_APPROVAL",now]);this.saveState(runId,state,"WAITING_APPROVAL");return id;}
  attachApproval(checkpointId:string,approvalId:string){this.db.run("UPDATE agent_checkpoints SET approval_id=? WHERE id=?",[approvalId,checkpointId]);}
  resume(checkpointId:string){const checkpoint=this.db.get<{run_id:string;state_json:string;status:string}>("SELECT * FROM agent_checkpoints WHERE id=?",[checkpointId]);if(!checkpoint||checkpoint.status!=="WAITING_APPROVAL")return;const state=JSON.parse(checkpoint.state_json) as PersistedAgentState;this.db.run("UPDATE agent_checkpoints SET status='RESUMED',resolved_at=? WHERE id=?",[new Date().toISOString(),checkpointId]);this.saveState(checkpoint.run_id,state,"RUNNING");const run=this.get(checkpoint.run_id);return run?{run,state}:undefined;}
  cancelCheckpoint(checkpointId:string,reason="Ação rejeitada pelo usuário."){const checkpoint=this.db.get<{run_id:string;status:string}>("SELECT run_id,status FROM agent_checkpoints WHERE id=?",[checkpointId]);if(!checkpoint||checkpoint.status!=="WAITING_APPROVAL")return false;const now=new Date().toISOString();this.db.run("UPDATE agent_checkpoints SET status='CANCELLED',resolved_at=? WHERE id=?",[now,checkpointId]);this.db.run("UPDATE agent_runs SET status='CANCELLED',final_response=?,updated_at=?,finished_at=? WHERE id=?",[reason,now,now,checkpoint.run_id]);return true;}
  finish(id:string,status:Extract<AgentRunStatus,"COMPLETED"|"FAILED"|"CANCELLED">,finalResponse:string){const now=new Date().toISOString();this.db.run("UPDATE agent_runs SET status=?,final_response=?,updated_at=?,finished_at=? WHERE id=?",[status,finalResponse,now,now,id]);}
  startLoop(state:AgentLoopState,context:AgentRuntimeContext={}){const now=new Date().toISOString();this.db.run("INSERT INTO agent_runs(id,user_request,status,state_json,created_at,updated_at,conversation_id,task_id,agent_id,engine_version,state_version) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[state.runId,state.userRequest,"RUNNING",JSON.stringify(state),now,now,context.conversationId??state.conversationId??null,context.taskId??state.taskId??null,context.agentId??null,"agent-loop-v2",2]);return state;}
  saveLoopState(runId:string,state:AgentLoopState){if(!this.db.get<{id:string}>("SELECT id FROM agent_runs WHERE id=?",[runId])){this.startLoop(state,{conversationId:state.conversationId,taskId:state.taskId});return;}this.db.run("UPDATE agent_runs SET state_json=?,status=?,updated_at=?,engine_version='agent-loop-v2',state_version=2 WHERE id=?",[JSON.stringify(state),state.status,new Date().toISOString(),runId]);}
  loadLoopState(runId:string){const row=this.db.get<{state_json:string;engine_version?:string}>("SELECT state_json,engine_version FROM agent_runs WHERE id=?",[runId]);if(!row||row.engine_version!=="agent-loop-v2")return undefined;return JSON.parse(row.state_json) as AgentLoopState;}
  resumeLoop(runId:string){const state=this.loadLoopState(runId);if(!state||["COMPLETED","FAILED","CANCELLED","RESULT_UNKNOWN"].includes(state.status))return undefined;return {...state,status:"DECIDING" as const};}
  finishLoop(runId:string,state:AgentLoopState){this.saveLoopState(runId,state);if(state.status==="COMPLETED"||state.status==="FAILED"||state.status==="CANCELLED")this.finish(runId,state.status,state.finalResponse??"");}
  getConversationActionContext(conversationId?:string):ConversationActionContextState|undefined{if(!conversationId)return undefined;const row=this.db.get<{value:string}>("SELECT value FROM application_state WHERE key=?",[`conversation-action:${conversationId}`]);if(!row)return undefined;try{return JSON.parse(row.value) as ConversationActionContextState;}catch{return undefined;}}
  saveConversationActionContext(conversationId:string|undefined,state:ConversationActionContextState){if(!conversationId)return;this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[`conversation-action:${conversationId}`,JSON.stringify(state)]);}
  clearConversationActionContext(conversationId:string){this.db.run("DELETE FROM application_state WHERE key=?",[`conversation-action:${conversationId}`]);}
  savePendingClarification(record:PendingClarification){this.ensureClarificationSchema();if(record.status==="pending")this.db.run("UPDATE pending_clarifications SET status='cancelled',resolved_at=? WHERE conversation_id=? AND status='pending' AND id<>?",[new Date().toISOString(),record.conversationId,record.id]);this.db.run("INSERT OR REPLACE INTO pending_clarifications(id,conversation_id,domain,intent,operation,original_request,partial_entities_json,questions_json,intent_json,values_json,status,created_at,resolved_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[record.id,record.conversationId,record.domain,record.intent,record.operation,record.originalRequest,JSON.stringify(record.partialEntities),JSON.stringify(record.questions),JSON.stringify(record.intentSnapshot),JSON.stringify(record.values),record.status,record.createdAt,record.resolvedAt??null,record.expiresAt??null]);}
  getPendingClarification(conversationId:string){this.ensureClarificationSchema();const row=this.db.get<ClarificationRow>("SELECT * FROM pending_clarifications WHERE conversation_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",[conversationId]);return row&&this.toClarification(row);}
  getClarification(id:string){this.ensureClarificationSchema();const row=this.db.get<ClarificationRow>("SELECT * FROM pending_clarifications WHERE id=?",[id]);return row&&this.toClarification(row);}
  updateClarification(record:PendingClarification){this.savePendingClarification(record);return record;}
  clearIntentLearning(){this.intentMemory.clear();}
  intentLearningCount(){return this.intentMemory.count();}
  private intentLearningEnabled(){const row=this.db.get<{value:string}>("SELECT value FROM settings WHERE key='app'");if(!row)return true;try{const settings=JSON.parse(row.value) as {privateMode?:boolean;intentLearningEnabled?:boolean};return !settings.privateMode&&settings.intentLearningEnabled!==false;}catch{return true;}}
  private ensureClarificationSchema(){this.db.run(`CREATE TABLE IF NOT EXISTS pending_clarifications (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    intent TEXT NOT NULL,
    operation TEXT NOT NULL,
    original_request TEXT NOT NULL,
    partial_entities_json TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    intent_json TEXT NOT NULL,
    values_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    expires_at TEXT
  )`);this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_clarifications_conversation ON pending_clarifications(conversation_id,status,created_at)");}
  private toClarification(row:ClarificationRow):PendingClarification{return{id:row.id,conversationId:row.conversation_id,domain:row.domain,intent:row.intent,operation:row.operation,originalRequest:row.original_request,partialEntities:JSON.parse(row.partial_entities_json),questions:JSON.parse(row.questions_json),status:row.status,createdAt:row.created_at,resolvedAt:row.resolved_at??undefined,expiresAt:row.expires_at??undefined,intentSnapshot:JSON.parse(row.intent_json),values:JSON.parse(row.values_json)};}
  private toRun(row:RunRow):AgentRun{return{id:row.id,status:row.status,state:JSON.parse(row.state_json),finalResponse:row.final_response??undefined,createdAt:row.created_at,updatedAt:row.updated_at};}
}
