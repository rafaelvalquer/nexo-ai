import { randomUUID } from "node:crypto";
import type {
  Automation,
  AutomationExecutionContext,
  AutomationRunViewModel,
  AutomationV2,
  AutomationViewModel,
  CreateAutomationV2Input,
  UpdateAutomationV2Input
} from "@nexo/shared";
import { DEFAULT_AUTOMATION_OUTPUT, DEFAULT_AUTOMATION_POLICY } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { AutomationConditionEvaluator } from "./conditions/evaluator.js";
import { parseNaturalSchedule } from "./natural-schedule.js";
import { AutomationRepository } from "./repository.js";
import { AutomationRunRepository } from "./runs/repository.js";
import { AutomationScheduler } from "./scheduler.js";

export class AutomationEngine {
  private repository: AutomationRepository;
  private runs: AutomationRunRepository;
  private conditions = new AutomationConditionEvaluator();
  private scheduler: AutomationScheduler;
  private runningAutomationIds = new Set<string>();
  private queuedTriggerPayload = new Map<string, Record<string, unknown>>();

  constructor(private db: NexoDatabase, private executeCommand: (command:string)=>Promise<unknown>) {
    this.repository = new AutomationRepository(db);
    this.runs = new AutomationRunRepository(db);
    this.scheduler = new AutomationScheduler((automation, payload) => this.run(automation, payload));
  }

  list(): AutomationViewModel[] { return this.repository.list().map(automation => this.toViewModel(automation)); }
  get(id: string): AutomationViewModel | undefined { const automation = this.repository.get(id); return automation ? this.toViewModel(automation) : undefined; }

  create(input: Omit<Automation,"id"|"lastRunAt"> | CreateAutomationV2Input): AutomationViewModel {
    const automation = this.repository.create(isV2Input(input) ? input : legacyInputToV2(input));
    if (automation.enabled) this.install(automation);
    return this.toViewModel(this.repository.get(automation.id) ?? automation);
  }

  createFromNatural(input: { name:string; when:string; command:string; enabled?:boolean }): AutomationViewModel {
    return this.create({
      name: input.name,
      enabled: input.enabled ?? true,
      trigger: { type: "schedule", mode: "cron", cron: parseNaturalSchedule(input.when) },
      conditions: [],
      conditionOperator: "AND",
      actions: [{ id: "command", type: "nexo.command", config: { command: input.command } }],
      output: DEFAULT_AUTOMATION_OUTPUT,
      policy: DEFAULT_AUTOMATION_POLICY
    });
  }

  update(id: string, patch: UpdateAutomationV2Input): AutomationViewModel {
    this.scheduler.uninstall(id);
    const automation = this.repository.update(id, patch);
    if (automation.enabled) this.install(automation);
    return this.toViewModel(this.repository.get(id) ?? automation);
  }

  duplicate(id: string): AutomationViewModel { return this.toViewModel(this.repository.duplicate(id)); }

  setEnabled(id:string,enabled:boolean): AutomationViewModel {
    this.scheduler.uninstall(id);
    const automation = this.repository.setEnabled(id, enabled);
    if (enabled) this.install(automation);
    return this.toViewModel(this.repository.get(id) ?? automation);
  }

  remove(id:string): void { this.scheduler.uninstall(id); this.repository.remove(id); }

  async runManual(id:string): Promise<AutomationViewModel> {
    const automation = this.repository.get(id);
    if (!automation) throw new Error("Automação não encontrada.");
    if (!automation.enabled) throw new Error("Ative a automação antes de executá-la.");
    await this.run(automation, { source: "manual" });
    return this.get(id) ?? this.toViewModel(automation);
  }

  async test(id: string): Promise<AutomationRunViewModel | undefined> {
    const automation = this.repository.get(id);
    if (!automation) throw new Error("Automação não encontrada.");
    return this.run(automation, { source: "test", dryRun: true }, true);
  }

  listRuns(id: string, limit = 50): AutomationRunViewModel[] { return this.runs.list(id, limit); }
  getRun(id: string): AutomationRunViewModel | undefined { return this.runs.get(id); }

  start(): void { for (const automation of this.repository.list()) if (automation.enabled) this.install(automation); }
  stop(): void { this.scheduler.stopAll(); }

  private install(automation: AutomationV2): void {
    const nextRunAt = this.scheduler.nextRun(automation);
    this.repository.updateRunState(automation.id, { nextRunAt });
    this.scheduler.install(automation);
  }

  private async run(automation: AutomationV2, payload: Record<string, unknown>, ignoreEnabled = false): Promise<AutomationRunViewModel | undefined> {
    const fresh = this.repository.get(automation.id) ?? automation;
    if (!ignoreEnabled && !fresh.enabled) return undefined;
    if (this.runningAutomationIds.has(fresh.id)) { this.queuedTriggerPayload.set(fresh.id, payload); return undefined; }
    this.runningAutomationIds.add(fresh.id);
    const runId = randomUUID();
    const context: AutomationExecutionContext = { automationId:fresh.id,runId,trigger:{type:fresh.trigger.type,data:payload},actionResults:{},startedAt:new Date().toISOString() };
    this.runs.start(fresh.id, fresh.trigger.type, payload, context);
    try {
      if (!this.conditions.evaluate(fresh.conditions, fresh.conditionOperator, context)) {
        this.runs.finish(runId, "skipped", { summary: "Condições não atendidas." });
        this.repository.updateRunState(fresh.id, { lastRunAt:new Date().toISOString(),lastRunStatus:"skipped",nextRunAt:this.scheduler.nextRun(fresh) });
        return this.runs.get(runId);
      }
      for (let index=0; index<fresh.actions.length; index++) {
        const action = fresh.actions[index];
        const stepId = this.runs.startStep(runId,index+1,action.id,action.type);
        try {
          const result = await this.executeWithRetry(fresh, () => this.executeAction(action.type, action.config));
          context.actionResults[action.id] = result;
          this.runs.finishStep(stepId,"success",{summary:summaryFor(result)});
          this.runs.updateContext(runId,context,index+1);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.runs.finishStep(stepId,"failed",{error:message});
          if (!action.continueOnError) throw error;
          context.actionResults[action.id] = { ok:false,error:message };
        }
      }
      this.runs.finish(runId,"success",{summary:"Automação concluída."});
      this.repository.updateRunState(fresh.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"success",consecutiveFailures:0,nextRunAt:this.scheduler.nextRun(fresh)});
      return this.runs.get(runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.runs.finish(runId,"failed",{error:message});
      const failures = fresh.consecutiveFailures + 1;
      const shouldPause = failures >= 5 && fresh.policy.onRepeatedFailure === "pause";
      this.repository.updateRunState(fresh.id,{lastRunAt:new Date().toISOString(),lastRunStatus:"failed",consecutiveFailures:failures,nextRunAt:shouldPause?undefined:this.scheduler.nextRun(fresh)});
      if (shouldPause) { this.scheduler.uninstall(fresh.id); this.repository.setEnabled(fresh.id,false); }
      return this.runs.get(runId);
    } finally {
      this.runningAutomationIds.delete(fresh.id);
      const queued = this.queuedTriggerPayload.get(fresh.id);
      if (queued) { this.queuedTriggerPayload.delete(fresh.id); const latest=this.repository.get(fresh.id); if(latest?.enabled) queueMicrotask(()=>void this.run(latest,queued)); }
    }
  }

  private async executeAction(type: string, config: Record<string, unknown>): Promise<unknown> {
    if (type === "nexo.command") {
      const command = typeof config.command === "string" ? config.command.trim() : "";
      if (!command) throw new Error("A ação não possui comando configurado.");
      return this.executeCommand(command);
    }
    if (type === "notification.show") return { ok:true, title:config.title, content:config.content };
    throw new Error(`Ação de automação ainda não registrada: ${type}`);
  }

  private async executeWithRetry(automation: AutomationV2, action: () => Promise<unknown>): Promise<unknown> {
    const attempts = automation.policy.retries.enabled ? Math.max(0, automation.policy.retries.count) + 1 : 1;
    let lastError: unknown;
    for (let attempt=0; attempt<attempts; attempt++) {
      try { return await action(); }
      catch (error) { lastError=error; if (!isTransient(error) || attempt===attempts-1) throw error; }
    }
    throw lastError;
  }

  private toViewModel(automation: AutomationV2): AutomationViewModel {
    const running = this.runningAutomationIds.has(automation.id);
    const status = running ? "running" : automation.consecutiveFailures >= 5 ? "attention" : automation.enabled ? "active" : "paused";
    return { ...automation, status, triggerLabel:triggerLabel(automation), actionSummary:actionSummary(automation) };
  }
}

function isV2Input(input: Omit<Automation,"id"|"lastRunAt"> | CreateAutomationV2Input): input is CreateAutomationV2Input { return "trigger" in input && "actions" in input; }
function legacyInputToV2(input: Omit<Automation,"id"|"lastRunAt">): CreateAutomationV2Input {
  const trigger = input.triggerType === "cron" ? { type:"schedule" as const,mode:"cron" as const,cron:input.schedule }
    : input.triggerType === "file-created" ? { type:"file.created" as const,path:input.watchPath ?? "" }
    : input.triggerType === "file-changed" ? { type:"file.changed" as const,path:input.watchPath ?? "" }
    : input.triggerType === "app-start" ? { type:"app-start" as const }
    : { type:"manual" as const };
  return { name:input.name,enabled:input.enabled,trigger,conditions:[],conditionOperator:"AND",actions:[{id:"legacy-command",type:"nexo.command",config:{command:input.command}}],output:DEFAULT_AUTOMATION_OUTPUT,policy:DEFAULT_AUTOMATION_POLICY };
}
function isTransient(error: unknown): boolean { const message=(error instanceof Error?error.message:String(error)).toLowerCase();return /timeout|timed out|network|temporar|econnreset|econnrefused|503|502|429/.test(message); }
function summaryFor(result: unknown): string { if(result&&typeof result==="object"&&"summary" in result&&typeof (result as {summary?:unknown}).summary==="string")return (result as {summary:string}).summary;return "Concluída"; }
function triggerLabel(automation: AutomationV2): string { const t=automation.trigger;if(t.type==="schedule")return t.cron?`Agendamento · ${t.cron}`:t.time?`${t.mode} · ${t.time}`:"Agendamento";if(t.type==="interval")return `A cada ${t.minutes} min`;if(t.type==="file.created")return "Arquivo criado";if(t.type==="file.changed")return "Arquivo alterado";if(t.type==="file.deleted")return "Arquivo removido";if(t.type==="email.received")return "Novo e-mail";if(t.type==="calendar.before_event")return `${t.minutesBefore} min antes do compromisso`;if(t.type==="calendar.event_started")return "Compromisso iniciado";if(t.type==="system.threshold")return `${t.metric} ${t.operator} ${t.threshold}`;if(t.type==="app-start")return "Ao iniciar o Nexo";return "Manual"; }
function actionSummary(automation: AutomationV2): string { if(!automation.actions.length)return "Nenhuma ação";const names=automation.actions.map(action=>action.type==="nexo.command"?"Comando Nexo":action.type==="notification.show"?"Notificação":action.type);return names.slice(0,2).join(" + ")+(names.length>2?` +${names.length-2}`:""); }
