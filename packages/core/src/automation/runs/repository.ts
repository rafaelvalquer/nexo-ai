import { randomUUID } from "node:crypto";
import type { AutomationExecutionContext, AutomationRunStatus, AutomationRunStepViewModel, AutomationRunViewModel } from "@nexo/shared";
import { NexoDatabase } from "../../database/db.js";

export class AutomationRunRepository {
  constructor(private db: NexoDatabase) { this.ensureSchema(); }

  start(automationId: string, triggerType: string, triggerPayload: Record<string, unknown>, context: AutomationExecutionContext): AutomationRunViewModel {
    const id = context.runId || randomUUID();
    const startedAt = context.startedAt || new Date().toISOString();
    this.db.run("INSERT INTO automation_runs(id,automation_id,trigger_type,trigger_payload_json,status,started_at,context_json,next_action_index) VALUES(?,?,?,?,?,?,?,0)", [id, automationId, triggerType, JSON.stringify(triggerPayload), "running", startedAt, JSON.stringify(context)]);
    return { id, automationId, triggerType, status: "running", startedAt };
  }

  finish(id: string, status: AutomationRunStatus, details: { summary?: string; error?: string; approvalId?: string } = {}): void {
    const row = this.db.get<{ started_at: string }>("SELECT started_at FROM automation_runs WHERE id=?", [id]);
    const finishedAt = new Date().toISOString();
    const durationMs = row ? Math.max(0, Date.parse(finishedAt) - Date.parse(row.started_at)) : undefined;
    this.db.run("UPDATE automation_runs SET status=?,finished_at=?,duration_ms=?,summary=?,error=?,approval_id=? WHERE id=?", [status, finishedAt, durationMs ?? null, details.summary ?? null, details.error ?? null, details.approvalId ?? null, id]);
  }

  linkTask(id:string,conversationId:string,taskId:string):void {
    this.db.run("UPDATE automation_runs SET conversation_id=?,task_id=? WHERE id=?",[conversationId,taskId,id]);
  }

  waitForApproval(id: string, approvalId: string, context: AutomationExecutionContext, nextActionIndex: number): void {
    this.db.run("UPDATE automation_runs SET status='waiting_approval',approval_id=?,context_json=?,next_action_index=? WHERE id=?", [approvalId, JSON.stringify(context), nextActionIndex, id]);
  }

  updateContext(id: string, context: AutomationExecutionContext, nextActionIndex: number): void {
    this.db.run("UPDATE automation_runs SET context_json=?,next_action_index=? WHERE id=?", [JSON.stringify(context), nextActionIndex, id]);
  }

  startStep(runId: string, ordinal: number, actionId: string, actionType: string): string {
    const id = randomUUID();
    this.db.run("INSERT INTO automation_run_steps(id,run_id,ordinal,action_id,action_type,status,started_at) VALUES(?,?,?,?,?,'running',?)", [id, runId, ordinal, actionId, actionType, new Date().toISOString()]);
    return id;
  }

  waitStep(id: string, approvalId: string): void { this.db.run("UPDATE automation_run_steps SET status='waiting_approval',approval_id=? WHERE id=?",[approvalId,id]); }

  finishStep(id: string, status: AutomationRunStatus, details: { summary?: string; error?: string; approvalId?: string } = {}): void {
    const row = this.db.get<{ started_at: string }>("SELECT started_at FROM automation_run_steps WHERE id=?", [id]);
    const finishedAt = new Date().toISOString();
    const durationMs = row ? Math.max(0, Date.parse(finishedAt) - Date.parse(row.started_at)) : undefined;
    this.db.run("UPDATE automation_run_steps SET status=?,finished_at=?,duration_ms=?,summary=?,error=?,approval_id=COALESCE(?,approval_id) WHERE id=?", [status, finishedAt, durationMs ?? null, details.summary ?? null, details.error ?? null, details.approvalId ?? null, id]);
  }

  finishStepByApproval(approvalId: string, status: AutomationRunStatus, details: { summary?: string; error?: string } = {}): void {
    const step=this.db.get<{id:string}>("SELECT id FROM automation_run_steps WHERE approval_id=? ORDER BY started_at DESC LIMIT 1",[approvalId]);
    if(step)this.finishStep(step.id,status,{...details,approvalId});
  }

  list(automationId: string, limit = 50): AutomationRunViewModel[] {
    const rows = this.db.all<RunRow>("SELECT * FROM automation_runs WHERE automation_id=? ORDER BY started_at DESC LIMIT ?", [automationId, limit]);
    return rows.map(row => this.mapRun(row, false));
  }

  get(id: string): AutomationRunViewModel | undefined {
    const row = this.db.get<RunRow>("SELECT * FROM automation_runs WHERE id=?", [id]);
    return row ? this.mapRun(row, true) : undefined;
  }

  pendingByApproval(approvalId: string): { run: AutomationRunViewModel; context: AutomationExecutionContext; nextActionIndex: number } | undefined {
    const row = this.db.get<RunRow>("SELECT * FROM automation_runs WHERE approval_id=? AND status='waiting_approval'", [approvalId]);
    if (!row || !row.context_json) return undefined;
    return { run: this.mapRun(row, true), context: JSON.parse(row.context_json) as AutomationExecutionContext, nextActionIndex: Number(row.next_action_index ?? 0) };
  }

  pendingApprovalIds(): string[] { return this.db.all<{approval_id:string}>("SELECT approval_id FROM automation_runs WHERE status='waiting_approval' AND approval_id IS NOT NULL").map(row=>row.approval_id); }

  private mapRun(row: RunRow, includeSteps: boolean): AutomationRunViewModel {
    const run: AutomationRunViewModel = { id: row.id, automationId: row.automation_id, triggerType: row.trigger_type, status: asStatus(row.status), startedAt: row.started_at, finishedAt: row.finished_at ?? undefined, durationMs: row.duration_ms ?? undefined, summary: row.summary ?? undefined, error: row.error ?? undefined, taskId: row.task_id ?? undefined, conversationId: row.conversation_id ?? undefined, approvalId: row.approval_id ?? undefined };
    if (includeSteps) run.steps = this.db.all<StepRow>("SELECT * FROM automation_run_steps WHERE run_id=? ORDER BY ordinal", [row.id]).map(mapStep);
    return run;
  }

  private ensureSchema(): void {
    this.db.run("CREATE TABLE IF NOT EXISTS automation_runs(id TEXT PRIMARY KEY,automation_id TEXT NOT NULL,trigger_type TEXT NOT NULL,trigger_payload_json TEXT,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,duration_ms INTEGER,summary TEXT,error TEXT,task_id TEXT,approval_id TEXT,context_json TEXT,next_action_index INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(automation_id) REFERENCES automations(id))");
    this.db.run("CREATE TABLE IF NOT EXISTS automation_run_steps(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,ordinal INTEGER NOT NULL,action_id TEXT NOT NULL,action_type TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,duration_ms INTEGER,summary TEXT,error TEXT,approval_id TEXT,FOREIGN KEY(run_id) REFERENCES automation_runs(id))");
  }
}

type RunRow = { id:string;automation_id:string;trigger_type:string;status:string;started_at:string;finished_at:string|null;duration_ms:number|null;summary:string|null;error:string|null;task_id:string|null;conversation_id:string|null;approval_id:string|null;context_json:string|null;next_action_index:number|null };
type StepRow = { id:string;run_id:string;ordinal:number;action_id:string;action_type:string;status:string;started_at:string;finished_at:string|null;duration_ms:number|null;summary:string|null;error:string|null;approval_id:string|null };
function mapStep(row: StepRow): AutomationRunStepViewModel { return { id:row.id,runId:row.run_id,ordinal:row.ordinal,actionId:row.action_id,actionType:row.action_type,status:asStatus(row.status),startedAt:row.started_at,finishedAt:row.finished_at??undefined,durationMs:row.duration_ms??undefined,summary:row.summary??undefined,error:row.error??undefined,approvalId:row.approval_id??undefined }; }
function asStatus(value:string):AutomationRunStatus { return value === "queued" || value === "running" || value === "waiting_approval" || value === "success" || value === "failed" || value === "skipped" || value === "cancelled" ? value : "failed"; }
