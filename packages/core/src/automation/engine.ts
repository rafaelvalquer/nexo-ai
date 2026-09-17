import { randomUUID } from "node:crypto";
import type { Automation, AutomationCondition, AutomationExecutionContext, AutomationExecutionResult, AutomationRunViewModel, AutomationV2, AutomationViewModel, CreateAutomationV2Input, UpdateAutomationV2Input } from "@nexo/shared";
import { DEFAULT_AUTOMATION_OUTPUT, DEFAULT_AUTOMATION_POLICY } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { AUTOMATION_ACTION_CATALOG } from "./actions/catalog.js";
import { AutomationActionExecutor, resolveConfig } from "./actions/executor.js";
import { AutomationConditionEvaluator } from "./conditions/evaluator.js";
import { parseNaturalSchedule } from "./natural-schedule.js";
import { AUTOMATION_PRESETS } from "./presets/index.js";
import { AutomationRepository } from "./repository.js";
import { AutomationRunRepository } from "./runs/repository.js";
import { AutomationScheduler } from "./scheduler.js";
import { AUTOMATION_TRIGGER_CATALOG } from "./triggers/catalog.js";
import { AutomationTriggerRegistry } from "./triggers/registry.js";

const RETRY_SAFE_ACTION_TYPES=new Set(["web.search","web.fetch","filesystem.list","system.snapshot","email.summary","calendar.summary","ai.summarize","ai.classify"]);

export class AutomationEngine {
  private repository: AutomationRepository;
  private runs: AutomationRunRepository;
  private conditions = new AutomationConditionEvaluator();
  private actions: AutomationActionExecutor;
  private scheduler: AutomationScheduler;
  private smartTriggers: AutomationTriggerRegistry;
  private runningAutomationIds = new Set<string>();
  private runControllers = new Map<string,AbortController>();
  private queuedTriggerPayload = new Map<string, Record<string, unknown>>();
  private approvalPollers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private db: NexoDatabase, executeCommand: (command:string,signal?:AbortSignal)=>Promise<unknown>, private startAutomationChat?: (input: { title: string; prompt: string; automationRunId: string }) => Promise<{ conversationId: string; taskId: string }>,executeRead: (name:string,input:Record<string,unknown>)=>Promise<import("@nexo/shared").ToolResult>=async()=>{throw new Error("Executor de leitura não configurado.");},private notify:(title:string,body:string)=>void=()=>undefined) {
    this.repository = new AutomationRepository(db);
    this.runs = new AutomationRunRepository(db);
    this.actions = new AutomationActionExecutor(executeCommand);
    const emit=(automation:AutomationV2,payload:Record<string,unknown>)=>this.run(automation,payload);
    this.scheduler = new AutomationScheduler(emit);
    this.smartTriggers = new AutomationTriggerRegistry(this.repository,emit,executeRead);
  }

  list(): AutomationViewModel[] { return this.repository.list().map(automation => this.toViewModel(automation)); }
  get(id: string): AutomationViewModel | undefined { const automation = this.repository.get(id); return automation ? this.toViewModel(automation) : undefined; }
  presets() { return structuredClone(AUTOMATION_PRESETS); }
  actionCatalog() { return structuredClone(AUTOMATION_ACTION_CATALOG); }
  triggerCatalog() { return structuredClone(AUTOMATION_TRIGGER_CATALOG); }
  create(input: Omit<Automation,"id"|"lastRunAt"> | CreateAutomationV2Input): AutomationViewModel { const automation=this.repository.create(isV2Input(input)?input:legacyInputToV2(input));if(automation.enabled)this.install(automation);return this.get(automation.id)??this.toViewModel(automation); }
  createFromNatural(input:{name:string;when:string;command:string;enabled?:boolean}):AutomationViewModel{return this.create({name:input.name,prompt:input.command,enabled:input.enabled??true,trigger:{type:"schedule",mode:"cron",cron:parseNaturalSchedule(input.when)},conditions:[],conditionOperator:"AND",actions:[{id:"command",type:"nexo.command",config:{command:input.command}}],output:{type:"chat",conversationMode:"automation"},policy:DEFAULT_AUTOMATION_POLICY});}
  update(id:string,patch:UpdateAutomationV2Input):AutomationViewModel{this.uninstall(id);const automation=this.repository.update(id,patch);if(automation.enabled)this.install(automation);return this.get(id)??this.toViewModel(automation);}
  duplicate(id:string):AutomationViewModel{return this.toViewModel(this.repository.duplicate(id));}
  setEnabled(id:string,enabled:boolean):AutomationViewModel{this.uninstall(id);const automation=this.repository.setEnabled(id,enabled);if(enabled)this.install(automation);return this.get(id)??this.toViewModel(automation);}
  remove(id:string):void{this.uninstall(id);this.repository.remove(id);}
  listRuns(id:string,limit=50):AutomationRunViewModel[]{return this.runs.list(id,limit);}
  getRun(id:string):AutomationRunViewModel|undefined{return this.runs.get(id);}

  async runManual(id:string):Promise<AutomationViewModel|AutomationExecutionResult>{const automation=this.repository.get(id);if(!automation)throw new Error("Automação não encontrada.");if(!automation.enabled)throw new Error("Ative a automação antes de executá-la.");if(automation.output.type==="chat"&&this.startAutomationChat)return this.runChat(automation);await this.run(automation,{source:"manual"});return this.get(id)??this.toViewModel(automation);}
  cancel(id:string):boolean{const controller=this.runControllers.get(id);if(!controller)return false;controller.abort(new Error("Execução cancelada pelo usuário."));return true;}
  async resumeFailedRun(runId:string,mode:"retry"|"continue"):Promise<AutomationRunViewModel>{const failed=this.runs.failedContext(runId);if(!failed)throw new Error("Só é possível retomar uma execução que falhou.");const automation=this.repository.get(this.runs.get(runId)?.automationId??"");if(!automation)throw new Error("A macro desta execução não existe mais.");if(this.runningAutomationIds.has(automation.id))throw new Error("Esta macro já está executando.");const originalIndex=failed.nextActionIndex;if(originalIndex<0||originalIndex>=automation.actions.length)throw new Error("A etapa que falhou não está mais disponível nesta macro.");const context=failed.context;let startIndex=originalIndex;if(mode==="continue"){const failedAction=automation.actions[originalIndex];context.actionResults[failedAction.id]={ok:false,skipped:true,reason:"continued_by_user"};this.runs.skipFailedStep(runId,originalIndex+1);startIndex=originalIndex+1;}this.runs.prepareResume(runId,context,startIndex);this.runningAutomationIds.add(automation.id);const controller=new AbortController();this.runControllers.set(automation.id,controller);try{await this.executeFrom(automation,context,startIndex);return this.runs.get(runId)!;}finally{if(this.runControllers.get(automation.id)===controller)this.runControllers.delete(automation.id);this.releaseRun(automation.id);}}
  async test(id:string):Promise<AutomationRunViewModel|AutomationExecutionResult|undefined>{const automation=this.repository.get(id);if(!automation)throw new Error("Automação não encontrada.");return this.run(automation,{source:"test",dryRun:true},true);}
  async testDraft(input:CreateAutomationV2Input):Promise<AutomationRunViewModel|AutomationExecutionResult|undefined>{const automation=this.repository.create({...input,enabled:false,trigger:{type:"manual"}});try{return await this.run(automation,{source:"test",dryRun:true},true);}finally{this.repository.remove(automation.id);}}

  private async runChat(automation: AutomationV2, payload: Record<string, unknown> = { source: "manual" }): Promise<AutomationExecutionResult> {
    const runId=randomUUID();
    const context:AutomationExecutionContext={automationId:automation.id,runId,trigger:{type:automation.trigger.type,data:payload},actionResults:{},startedAt:new Date().toISOString()};
    this.runs.start(automation.id,automation.trigger.type,payload,context);
    const title=`${automation.name} · ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}`;
    const prompt=automation.prompt?.trim()||fallbackPrompt(automation);
    try {
      if(!this.startAutomationChat)throw new Error("Execução em conversa não está disponível.");
      const task=await this.startAutomationChat({title,prompt,automationRunId:runId});
      this.runs.linkTask(runId,task.conversationId,task.taskId);
      this.watchChatRun(runId, task.taskId);
      return {automationId:automation.id,runId,conversationId:task.conversationId,taskId:task.taskId};
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      this.runs.finish(runId,"failed",{error:message});
      this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"failed",consecutiveFailures:automation.consecutiveFailures+1});
      throw error;
    }
  }

  private watchChatRun(runId:string, taskId:string):void {
    const timer=setInterval(()=>{
      const row=this.db.get<{status:string;result_json:string|null;error:string|null}>("SELECT status,result_json,error FROM tasks WHERE id=?",[taskId]);
      if(!row){clearInterval(timer);void this.completeChatRun(runId,"failed",undefined,"A tarefa da conversa não foi encontrada.");return;}
      if(!["completed","failed","cancelled"].includes(row.status))return;
      clearInterval(timer);
      let summary:string|undefined;
      if(row.result_json){try{const value=JSON.parse(row.result_json) as Record<string,unknown>;summary=typeof value.text==="string"?value.text:typeof value.summary==="string"?value.summary:undefined;}catch{}}
      this.completeChatRun(runId,row.status==="completed"?"success":row.status==="cancelled"?"cancelled":"failed",summary,row.error??undefined);
    },1000);
    timer.unref?.();
  }

  completeChatRun(runId:string,status:AutomationRunViewModel["status"],summary?:string,error?:string):void {
    const run=this.runs.get(runId);if(!run)return;
    this.runs.finish(runId,status,{summary,error});
    const current=this.repository.get(run.automationId);if(!current)return;
    this.repository.updateRunState(current.id,{lastRunAt:new Date().toISOString(),lastRunStatus:status,consecutiveFailures:status==="success"?0:current.consecutiveFailures+(status==="failed"?1:0),nextRunAt:this.scheduler.nextRun(current)});
  }

  start():void{for(const automation of this.repository.list())if(automation.enabled)this.install(automation);for(const approvalId of this.runs.pendingApprovalIds())this.watchApproval(approvalId);}
  stop():void{this.scheduler.stopAll();this.smartTriggers.stopAll();for(const timer of this.approvalPollers.values())clearInterval(timer);this.approvalPollers.clear();}

  private install(automation:AutomationV2):void{const nextRunAt=this.scheduler.nextRun(automation);this.repository.updateRunState(automation.id,{nextRunAt});this.scheduler.install(automation);this.smartTriggers.install(automation);}
  private uninstall(id:string):void{this.scheduler.uninstall(id);this.smartTriggers.uninstall(id);}

  private async run(automation:AutomationV2,payload:Record<string,unknown>,ignoreEnabled=false):Promise<AutomationRunViewModel|AutomationExecutionResult|undefined>{
    const fresh=this.repository.get(automation.id)??automation;if(!ignoreEnabled&&!fresh.enabled)return undefined;
    if(!ignoreEnabled&&fresh.output.type==="chat"&&this.startAutomationChat)return this.runChat(fresh,payload);
    if(this.runningAutomationIds.has(fresh.id)){this.queuedTriggerPayload.set(fresh.id,payload);return undefined;}
    this.runningAutomationIds.add(fresh.id);const runId=randomUUID(),controller=new AbortController();this.runControllers.set(fresh.id,controller);const context:AutomationExecutionContext={automationId:fresh.id,runId,trigger:{type:fresh.trigger.type,data:payload},actionResults:{},startedAt:new Date().toISOString()};this.runs.start(fresh.id,fresh.trigger.type,payload,context);
    try{
      if(!this.conditions.evaluate(fresh.conditions,fresh.conditionOperator,context)){this.runs.finish(runId,"skipped",{summary:"Condições não atendidas."});this.repository.updateRunState(fresh.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"skipped",nextRunAt:this.scheduler.nextRun(fresh)});return this.runs.get(runId);}
      return await this.executeFrom(fresh,context,0);
    }finally{if(this.runControllers.get(fresh.id)===controller)this.runControllers.delete(fresh.id);this.releaseRun(fresh.id);}
  }

  private async executeFrom(automation:AutomationV2,context:AutomationExecutionContext,startIndex:number):Promise<AutomationRunViewModel|undefined>{
    try{
      for(let index=startIndex;index<automation.actions.length;index++){
        const action=automation.actions[index];const stepId=this.runs.startStep(context.runId,index+1,action.id,action.type);const controller=this.runControllers.get(automation.id);
        try{
          if(controller?.signal.aborted)throw controller.signal.reason??new Error("Execução cancelada.");
          if(action.condition){const condition={...action.condition,...resolveConfig({value:action.condition.value},context)} as AutomationCondition;if(!this.conditions.evaluate([condition],"AND",context)){context.actionResults[action.id]={ok:true,skipped:true,reason:"condition_not_met"};this.runs.finishStep(stepId,"skipped",{summary:"Condição não atendida; etapa ignorada."});this.runs.updateContext(context.runId,context,index+1);continue;}}
          const execution=await this.executeWithRetry(automation,action.type,()=>this.executeStep(action,context,controller));
          if(execution.approvalId){this.runs.waitStep(stepId,execution.approvalId);this.runs.waitForApproval(context.runId,execution.approvalId,context,index+1);this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"waiting_approval",nextRunAt:this.scheduler.nextRun(automation)});this.watchApproval(execution.approvalId);return this.runs.get(context.runId);}
          context.actionResults[action.id]=execution.value;if(action.type==="notification.show"&&execution.value&&typeof execution.value==="object"){const notification=(execution.value as {notification?:{title?:unknown;content?:unknown}}).notification;if(notification)this.notify(typeof notification.title==="string"?notification.title:"Nexo AI",typeof notification.content==="string"?notification.content:"");}this.runs.finishStep(stepId,"success",{summary:summaryFor(execution.value)});this.runs.updateContext(context.runId,context,index+1);
        }catch(error){const message=error instanceof Error?error.message:String(error);if(controller?.signal.aborted){this.runs.finishStep(stepId,"cancelled",{summary:"Etapa cancelada."});throw error;}this.runs.finishStep(stepId,"failed",{error:message});if(!action.continueOnError)throw error;context.actionResults[action.id]={ok:false,error:message};this.runs.updateContext(context.runId,context,index+1);}
      }
      this.runs.finish(context.runId,"success",{summary:"Automação concluída."});this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"success",consecutiveFailures:0,nextRunAt:this.scheduler.nextRun(automation)});return this.runs.get(context.runId);
    }catch(error){const cancelled=this.runControllers.get(automation.id)?.signal.aborted===true;const message=error instanceof Error?error.message:String(error);this.runs.finish(context.runId,cancelled?"cancelled":"failed",cancelled?{summary:"Execução cancelada."}:{error:message});const failures=automation.consecutiveFailures+(cancelled?0:1);const shouldPause=!cancelled&&failures>=5&&automation.policy.onRepeatedFailure==="pause";this.repository.updateRunState(automation.id,{lastRunAt:new Date().toISOString(),lastRunStatus:cancelled?"cancelled":"failed",consecutiveFailures:failures,nextRunAt:shouldPause?undefined:this.scheduler.nextRun(automation)});if(shouldPause){this.uninstall(automation.id);this.repository.setEnabled(automation.id,false);}return this.runs.get(context.runId);}
  }

  private async executeStep(action:AutomationV2["actions"][number],context:AutomationExecutionContext,parent?:AbortController){const step=new AbortController(),onAbort=()=>step.abort(parent?.signal.reason??new Error("Execução cancelada."));parent?.signal.addEventListener("abort",onAbort,{once:true});const timeoutMs=action.type==="system.wait"?310_000:120_000;const timer=setTimeout(()=>step.abort(new Error(`A etapa excedeu o limite de ${Math.ceil(timeoutMs/1000)} segundos.`)),timeoutMs);timer.unref?.();try{return await Promise.race([this.actions.execute(action,context,step.signal),new Promise<never>((_,reject)=>step.signal.addEventListener("abort",()=>reject(step.signal.reason??new Error("Etapa cancelada.")),{once:true}))]);}finally{clearTimeout(timer);parent?.signal.removeEventListener("abort",onAbort);}}

  private watchApproval(approvalId:string):void{
    if(this.approvalPollers.has(approvalId))return;
    const check=async()=>{const row=this.db.get<{status:string;task_id:string|null;task_status:string|null;result_json:string|null;error:string|null}>("SELECT a.status,a.task_id,t.status AS task_status,t.result_json,t.error FROM approvals a LEFT JOIN tasks t ON t.id=a.task_id WHERE a.id=?",[approvalId]);if(!row)return this.stopApprovalPoller(approvalId);if(row.status==="pending")return;
      if(row.status==="rejected"||row.status==="expired"){const pending=this.runs.pendingByApproval(approvalId);if(pending){this.runs.finishStepByApproval(approvalId,"cancelled",{summary:"Aprovação não concedida."});this.runs.finish(pending.run.id,"cancelled",{summary:"Aprovação não concedida.",approvalId});this.repository.updateRunState(pending.run.automationId,{lastRunAt:new Date().toISOString(),lastRunStatus:"cancelled"});}this.stopApprovalPoller(approvalId);return;}
      if(row.status==="approved"&&row.task_id&&row.task_status!=="completed"&&row.task_status!=="failed"&&row.task_status!=="cancelled")return;
      const pending=this.runs.pendingByApproval(approvalId);if(!pending){this.stopApprovalPoller(approvalId);return;}const current=this.repository.get(pending.run.automationId);if(!current){this.stopApprovalPoller(approvalId);return;}
      if(row.task_status==="failed"||row.task_status==="cancelled"){this.runs.finishStepByApproval(approvalId,"failed",{error:row.error??"A ação aprovada não foi concluída."});this.runs.finish(pending.run.id,"failed",{error:row.error??"A ação aprovada não foi concluída.",approvalId});this.repository.updateRunState(current.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"failed",consecutiveFailures:current.consecutiveFailures+1});this.stopApprovalPoller(approvalId);return;}
      const previousAction=current.actions[Math.max(0,pending.nextActionIndex-1)];const result=parseJson(row.result_json)??{ok:true,summary:"Ação aprovada e concluída."};if(previousAction)pending.context.actionResults[previousAction.id]=result;this.runs.finishStepByApproval(approvalId,"success",{summary:summaryFor(result)});this.runs.updateContext(pending.run.id,pending.context,pending.nextActionIndex);this.stopApprovalPoller(approvalId);
      if(this.runningAutomationIds.has(current.id)){setTimeout(()=>void this.resumeAfterApproval(current,pending.context,pending.nextActionIndex),250);return;}await this.resumeAfterApproval(current,pending.context,pending.nextActionIndex);
    };
    const timer=setInterval(()=>void check(),1500);timer.unref?.();this.approvalPollers.set(approvalId,timer);void check();
  }

  private async resumeAfterApproval(automation:AutomationV2,context:AutomationExecutionContext,nextActionIndex:number):Promise<void>{if(this.runningAutomationIds.has(automation.id)){setTimeout(()=>void this.resumeAfterApproval(automation,context,nextActionIndex),250);return;}this.runningAutomationIds.add(automation.id);try{await this.executeFrom(this.repository.get(automation.id)??automation,context,nextActionIndex);}finally{this.releaseRun(automation.id);}}
  private stopApprovalPoller(approvalId:string):void{const timer=this.approvalPollers.get(approvalId);if(timer)clearInterval(timer);this.approvalPollers.delete(approvalId);}
  private releaseRun(automationId:string):void{this.runningAutomationIds.delete(automationId);const queued=this.queuedTriggerPayload.get(automationId);if(queued){this.queuedTriggerPayload.delete(automationId);const latest=this.repository.get(automationId);if(latest?.enabled)queueMicrotask(()=>void this.run(latest,queued));}}
  private async executeWithRetry<T>(automation:AutomationV2,actionType:string,action:()=>Promise<T>):Promise<T>{const canRetry=RETRY_SAFE_ACTION_TYPES.has(actionType),attempts=canRetry&&automation.policy.retries.enabled?Math.max(0,automation.policy.retries.count)+1:1;let lastError:unknown;for(let attempt=0;attempt<attempts;attempt++){try{return await action();}catch(error){lastError=error;if(!canRetry||!isTransient(error)||attempt===attempts-1)throw error;}}throw lastError;}
  private toViewModel(automation:AutomationV2):AutomationViewModel{const running=this.runningAutomationIds.has(automation.id);const status=running?"running":automation.lastRunStatus==="waiting_approval"?"waiting_approval":automation.consecutiveFailures>=5?"attention":automation.enabled?"active":"paused";return{...automation,status,triggerLabel:triggerLabel(automation),actionSummary:actionSummary(automation)};}
}

function isV2Input(input:Omit<Automation,"id"|"lastRunAt">|CreateAutomationV2Input):input is CreateAutomationV2Input{return"trigger"in input&&"actions"in input;}
function legacyInputToV2(input:Omit<Automation,"id"|"lastRunAt">):CreateAutomationV2Input{const trigger=input.triggerType==="cron"?{type:"schedule" as const,mode:"cron" as const,cron:input.schedule}:input.triggerType==="file-created"?{type:"file.created" as const,path:input.watchPath??""}:input.triggerType==="file-changed"?{type:"file.changed" as const,path:input.watchPath??""}:input.triggerType==="app-start"?{type:"app-start" as const}:{type:"manual" as const};return{name:input.name,prompt:input.command,enabled:input.enabled,trigger,conditions:[],conditionOperator:"AND",actions:[{id:"legacy-command",type:"nexo.command",config:{command:input.command}}],output:{type:"chat",conversationMode:"automation"},policy:DEFAULT_AUTOMATION_POLICY};}
function isTransient(error:unknown):boolean{const message=(error instanceof Error?error.message:String(error)).toLowerCase();return/timeout|timed out|network|temporar|econnreset|econnrefused|503|502|429/.test(message);}
function summaryFor(result:unknown):string{if(result&&typeof result==="object"){const record=result as Record<string,unknown>;if(typeof record.summary==="string")return record.summary;if(typeof record.text==="string")return record.text.slice(0,500);}return"Concluída";}
function parseJson(value:string|null):unknown{if(!value)return undefined;try{return JSON.parse(value)as unknown;}catch{return value;}}
function triggerLabel(automation:AutomationV2):string{const t=automation.trigger;if(t.type==="schedule")return t.cron?`Agendamento · ${t.cron}`:t.time?`${t.mode} · ${t.time}`:"Agendamento";if(t.type==="interval")return`A cada ${t.minutes} min`;if(t.type==="file.created")return"Arquivo criado";if(t.type==="file.changed")return"Arquivo alterado";if(t.type==="file.deleted")return"Arquivo removido";if(t.type==="email.received")return"Novo e-mail";if(t.type==="calendar.before_event")return`${t.minutesBefore} min antes do compromisso`;if(t.type==="calendar.event_started")return"Compromisso iniciado";if(t.type==="system.threshold")return`${t.metric} ${t.operator} ${t.threshold}`;if(t.type==="app-start")return"Ao iniciar o Nexo";return"Manual";}
function actionSummary(automation:AutomationV2):string{if(!automation.actions.length)return"Nenhuma ação";const names=automation.actions.map(action=>action.type==="nexo.command"?"Comando Nexo":action.type==="notification.show"?"Notificação":action.type);return names.slice(0,2).join(" + ")+(names.length>2?` +${names.length-2}`:"");}
function fallbackPrompt(automation:AutomationV2):string{const command=automation.actions.find(action=>action.type==="nexo.command")?.config.command;if(typeof command==="string"&&command.trim())return command.trim();return `Execute a automação "${automation.name}" e explique o resultado de forma objetiva.`;}
