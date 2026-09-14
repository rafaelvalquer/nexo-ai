import { randomUUID } from "node:crypto";
import type { Automation, AutomationExecutionContext, AutomationRunViewModel, AutomationV2, AutomationViewModel, CreateAutomationV2Input, UpdateAutomationV2Input } from "@nexo/shared";
import { DEFAULT_AUTOMATION_OUTPUT, DEFAULT_AUTOMATION_POLICY } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { AutomationActionExecutor } from "./actions/executor.js";
import { AutomationConditionEvaluator } from "./conditions/evaluator.js";
import { parseNaturalSchedule } from "./natural-schedule.js";
import { AutomationRepository } from "./repository.js";
import { AutomationRunRepository } from "./runs/repository.js";
import { AutomationScheduler } from "./scheduler.js";

export class AutomationEngine {
  private repository: AutomationRepository;
  private runs: AutomationRunRepository;
  private conditions = new AutomationConditionEvaluator();
  private actions: AutomationActionExecutor;
  private scheduler: AutomationScheduler;
  private runningAutomationIds = new Set<string>();
  private queuedTriggerPayload = new Map<string, Record<string, unknown>>();
  private approvalPollers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private db: NexoDatabase, executeCommand: (command:string)=>Promise<unknown>) {
    this.repository = new AutomationRepository(db);
    this.runs = new AutomationRunRepository(db);
    this.actions = new AutomationActionExecutor(executeCommand);
    this.scheduler = new AutomationScheduler((automation, payload) => this.run(automation, payload));
  }

  list(): AutomationViewModel[] { return this.repository.list().map(automation => this.toViewModel(automation)); }
  get(id: string): AutomationViewModel | undefined { const automation = this.repository.get(id); return automation ? this.toViewModel(automation) : undefined; }
  create(input: Omit<Automation,"id"|"lastRunAt"> | CreateAutomationV2Input): AutomationViewModel { const automation=this.repository.create(isV2Input(input)?input:legacyInputToV2(input));if(automation.enabled)this.install(automation);return this.get(automation.id)??this.toViewModel(automation); }
  createFromNatural(input:{name:string;when:string;command:string;enabled?:boolean}):AutomationViewModel{return this.create({name:input.name,enabled:input.enabled??true,trigger:{type:"schedule",mode:"cron",cron:parseNaturalSchedule(input.when)},conditions:[],conditionOperator:"AND",actions:[{id:"command",type:"nexo.command",config:{command:input.command}}],output:DEFAULT_AUTOMATION_OUTPUT,policy:DEFAULT_AUTOMATION_POLICY});}
  update(id:string,patch:UpdateAutomationV2Input):AutomationViewModel{this.scheduler.uninstall(id);const automation=this.repository.update(id,patch);if(automation.enabled)this.install(automation);return this.get(id)??this.toViewModel(automation);}
  duplicate(id:string):AutomationViewModel{return this.toViewModel(this.repository.duplicate(id));}
  setEnabled(id:string,enabled:boolean):AutomationViewModel{this.scheduler.uninstall(id);const automation=this.repository.setEnabled(id,enabled);if(enabled)this.install(automation);return this.get(id)??this.toViewModel(automation);}
  remove(id:string):void{this.scheduler.uninstall(id);this.repository.remove(id);}
  listRuns(id:string,limit=50):AutomationRunViewModel[]{return this.runs.list(id,limit);}
  getRun(id:string):AutomationRunViewModel|undefined{return this.runs.get(id);}

  async runManual(id:string):Promise<AutomationViewModel>{const automation=this.repository.get(id);if(!automation)throw new Error("Automação não encontrada.");if(!automation.enabled)throw new Error("Ative a automação antes de executá-la.");await this.run(automation,{source:"manual"});return this.get(id)??this.toViewModel(automation);}
  async test(id:string):Promise<AutomationRunViewModel|undefined>{const automation=this.repository.get(id);if(!automation)throw new Error("Automação não encontrada.");return this.run(automation,{source:"test",dryRun:true},true);}

  start():void{for(const automation of this.repository.list())if(automation.enabled)this.install(automation);for(const approvalId of this.runs.pendingApprovalIds())this.watchApproval(approvalId);}
  stop():void{this.scheduler.stopAll();for(const timer of this.approvalPollers.values())clearInterval(timer);this.approvalPollers.clear();}

  private install(automation:AutomationV2):void{const nextRunAt=this.scheduler.nextRun(automation);this.repository.updateRunState(automation.id,{nextRunAt});this.scheduler.install(automation);}

  private async run(automation:AutomationV2,payload:Record<string,unknown>,ignoreEnabled=false):Promise<AutomationRunViewModel|undefined>{
    const fresh=this.repository.get(automation.id)??automation;if(!ignoreEnabled&&!fresh.enabled)return undefined;
    if(this.runningAutomationIds.has(fresh.id)){this.queuedTriggerPayload.set(fresh.id,payload);return undefined;}
    this.runningAutomationIds.add(fresh.id);const runId=randomUUID();const context:AutomationExecutionContext={automationId:fresh.id,runId,trigger:{type:fresh.trigger.type,data:payload},actionResults:{},startedAt:new Date().toISOString()};this.runs.start(fresh.id,fresh.trigger.type,payload,context);
    try{
      if(!this.conditions.evaluate(fresh.conditions,fresh.conditionOperator,context)){this.runs.finish(runId,"skipped",{summary:"Condições não atendidas."});this.repository.updateRunState(fresh.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"skipped",nextRunAt:this.scheduler.nextRun(fresh)});return this.runs.get(runId);}
      return await this.executeFrom(fresh,context,0);
    }finally{this.releaseRun(fresh.id);}
  }

  private async executeFrom(automation:AutomationV2,context:AutomationExecutionContext,startIndex:number):Promise<AutomationRunViewModel|undefined>{
    try{
      for(let index=startIndex;index<automation.actions.length;index++){
        const action=automation.actions[index];const stepId=this.runs.startStep(context.runId,index+1,action.id,action.type);
        try{
          const execution=await this.executeWithRetry(automation,()=>this.actions.execute(action,context));
          if(execution.approvalId){this.runs.waitStep(stepId,execution.approvalId);this.runs.waitForApproval(context.runId,execution.approvalId,context,index+1);this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"waiting_approval",nextRunAt:this.scheduler.nextRun(automation)});this.watchApproval(execution.approvalId);return this.runs.get(context.runId);}
          context.actionResults[action.id]=execution.value;this.runs.finishStep(stepId,"success",{summary:summaryFor(execution.value)});this.runs.updateContext(context.runId,context,index+1);
        }catch(error){const message=error instanceof Error?error.message:String(error);this.runs.finishStep(stepId,"failed",{error:message});if(!action.continueOnError)throw error;context.actionResults[action.id]={ok:false,error:message};}
      }
      this.runs.finish(context.runId,"success",{summary:"Automação concluída."});this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"success",consecutiveFailures:0,nextRunAt:this.scheduler.nextRun(automation)});return this.runs.get(context.runId);
    }catch(error){const message=error instanceof Error?error.message:String(error);this.runs.finish(context.runId,"failed",{error:message});const failures=automation.consecutiveFailures+1;const shouldPause=failures>=5&&automation.policy.onRepeatedFailure==="pause";this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"failed",consecutiveFailures:failures,nextRunAt:shouldPause?undefined:this.scheduler.nextRun(automation)});if(shouldPause){this.scheduler.uninstall(automation.id);this.repository.setEnabled(automation.id,false);}return this.runs.get(context.runId);}
  }

  private watchApproval(approvalId:string):void{
    if(this.approvalPollers.has(approvalId))return;
    const check=async()=>{const row=this.db.get<{status:string;task_id:string|null;task_status:string|null;result_json:string|null;error:string|null}>("SELECT a.status,a.task_id,t.status AS task_status,t.result_json,t.error FROM approvals a LEFT JOIN tasks t ON t.id=a.task_id WHERE a.id=?",[approvalId]);if(!row)return this.stopApprovalPoller(approvalId);if(row.status==="pending")return;
      if(row.status==="rejected"||row.status==="expired"){const pending=this.runs.pendingByApproval(approvalId);if(pending){this.runs.finishStepByApproval(approvalId,"cancelled",{summary:"Aprovação não concedida."});this.runs.finish(pending.run.id,"cancelled",{summary:"Aprovação não concedida.",approvalId});this.repository.updateRunState(pending.run.automationId,{lastRunAt:new Date().toISOString(),lastRunStatus:"cancelled"});}this.stopApprovalPoller(approvalId);return;}
      if(row.status==="approved"&&row.task_id&&row.task_status!=="completed"&&row.task_status!=="failed"&&row.task_status!=="cancelled")return;
      const pending=this.runs.pendingByApproval(approvalId);if(!pending){this.stopApprovalPoller(approvalId);return;}const automation=this.repository.get(pending.run.automationId);if(!automation){this.stopApprovalPoller(approvalId);return;}
      if(row.task_status==="failed"||row.task_status==="cancelled"){this.runs.finishStepByApproval(approvalId,"failed",{error:row.error??"A ação aprovada não foi concluída."});this.runs.finish(pending.run.id,"failed",{error:row.error??"A ação aprovada não foi concluída.",approvalId});this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"failed",consecutiveFailures:automation.consecutiveFailures+1});this.stopApprovalPoller(approvalId);return;}
      const previousAction=automation.actions[Math.max(0,pending.nextActionIndex-1)];const result=parseJson(row.result_json)??{ok:true,summary:"Ação aprovada e concluída."};if(previousAction)pending.context.actionResults[previousAction.id]=result;this.runs.finishStepByApproval(approvalId,"success",{summary:summaryFor(result)});this.runs.updateContext(pending.run.id,pending.context,pending.nextActionIndex);this.stopApprovalPoller(approvalId);
      if(this.runningAutomationIds.has(automation.id)){setTimeout(()=>this.resumeAfterApproval(automation,pending.context,pending.nextActionIndex),250);return;}await this.resumeAfterApproval(automation,pending.context,pending.nextActionIndex);
    };
    const timer=setInterval(()=>void check(),1500);timer.unref?.();this.approvalPollers.set(approvalId,timer);void check();
  }

  private async resumeAfterApproval(automation:AutomationV2,context:AutomationExecutionContext,nextActionIndex:number):Promise<void>{if(this.runningAutomationIds.has(automation.id)){setTimeout(()=>void this.resumeAfterApproval(automation,context,nextActionIndex),250);return;}this.runningAutomationIds.add(automation.id);try{await this.executeFrom(this.repository.get(automation.id)??automation,context,nextActionIndex);}finally{this.releaseRun(automation.id);}}
  private stopApprovalPoller(approvalId:string):void{const timer=this.approvalPollers.get(approvalId);if(timer)clearInterval(timer);this.approvalPollers.delete(approvalId);}
  private releaseRun(automationId:string):void{this.runningAutomationIds.delete(automationId);const queued=this.queuedTriggerPayload.get(automationId);if(queued){this.queuedTriggerPayload.delete(automationId);const latest=this.repository.get(automationId);if(latest?.enabled)queueMicrotask(()=>void this.run(latest,queued));}}
  private async executeWithRetry<T>(automation:AutomationV2,action:()=>Promise<T>):Promise<T>{const attempts=automation.policy.retries.enabled?Math.max(0,automation.policy.retries.count)+1:1;let lastError:unknown;for(let attempt=0;attempt<attempts;attempt++){try{return await action();}catch(error){lastError=error;if(!isTransient(error)||attempt===attempts-1)throw error;}}throw lastError;}
  private toViewModel(automation:AutomationV2):AutomationViewModel{const running=this.runningAutomationIds.has(automation.id);const status=running?"running":automation.lastRunStatus==="waiting_approval"?"waiting_approval":automation.consecutiveFailures>=5?"attention":automation.enabled?"active":"paused";return{...automation,status,triggerLabel:triggerLabel(automation),actionSummary:actionSummary(automation)};}
}

function isV2Input(input:Omit<Automation,"id"|"lastRunAt">|CreateAutomationV2Input):input is CreateAutomationV2Input{return"trigger"in input&&"actions"in input;}
function legacyInputToV2(input:Omit<Automation,"id"|"lastRunAt">):CreateAutomationV2Input{const trigger=input.triggerType==="cron"?{type:"schedule" as const,mode:"cron" as const,cron:input.schedule}:input.triggerType==="file-created"?{type:"file.created" as const,path:input.watchPath??""}:input.triggerType==="file-changed"?{type:"file.changed" as const,path:input.watchPath??""}:input.triggerType==="app-start"?{type:"app-start" as const}:{type:"manual" as const};return{name:input.name,enabled:input.enabled,trigger,conditions:[],conditionOperator:"AND",actions:[{id:"legacy-command",type:"nexo.command",config:{command:input.command}}],output:DEFAULT_AUTOMATION_OUTPUT,policy:DEFAULT_AUTOMATION_POLICY};}
function isTransient(error:unknown):boolean{const message=(error instanceof Error?error.message:String(error)).toLowerCase();return/timeout|timed out|network|temporar|econnreset|econnrefused|503|502|429/.test(message);}
function summaryFor(result:unknown):string{if(result&&typeof result==="object"){const record=result as Record<string,unknown>;if(typeof record.summary==="string")return record.summary;if(typeof record.text==="string")return record.text.slice(0,500);}return"Concluída";}
function parseJson(value:string|null):unknown{if(!value)return undefined;try{return JSON.parse(value)as unknown;}catch{return value;}}
function triggerLabel(automation:AutomationV2):string{const t=automation.trigger;if(t.type==="schedule")return t.cron?`Agendamento · ${t.cron}`:t.time?`${t.mode} · ${t.time}`:"Agendamento";if(t.type==="interval")return`A cada ${t.minutes} min`;if(t.type==="file.created")return"Arquivo criado";if(t.type==="file.changed")return"Arquivo alterado";if(t.type==="file.deleted")return"Arquivo removido";if(t.type==="email.received")return"Novo e-mail";if(t.type==="calendar.before_event")return`${t.minutesBefore} min antes do compromisso`;if(t.type==="calendar.event_started")return"Compromisso iniciado";if(t.type==="system.threshold")return`${t.metric} ${t.operator} ${t.threshold}`;if(t.type==="app-start")return"Ao iniciar o Nexo";return"Manual";}
function actionSummary(automation:AutomationV2):string{if(!automation.actions.length)return"Nenhuma ação";const names=automation.actions.map(action=>action.type==="nexo.command"?"Comando Nexo":action.type==="notification.show"?"Notificação":action.type);return names.slice(0,2).join(" + ")+(names.length>2?` +${names.length-2}`:"");}
