import { randomUUID } from "node:crypto";
import type { BrowserAgentMode, BrowserResearchResult, BrowserRun, BrowserRunEvent, BrowserRunStatus } from "@nexo/shared/browser-agent";
import type { NexoDatabase } from "../database/db.js";

const PERSONAL_PROFILE_SETTING = "browser-agent:personal-profile-enabled";

export class BrowserRunRepository {
  constructor(private readonly db: NexoDatabase) { this.ensureSchema(); }

  create(run: BrowserRun, startUrl?: string) {
    this.db.run(
      "INSERT INTO browser_runs(id,task_id,conversation_id,request,status,start_url,final_url,allowed_domains_json,mode,steps,result_json,error,started_at,finished_at,final_thumbnail) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [run.id, run.taskId, run.conversationId, run.request, run.status, startUrl ?? null, null, JSON.stringify(run.allowedDomains), run.mode, run.stepCount, null, null, run.startedAt, null, null]
    );
  }

  update(runId: string, patch: { errorCode?:string; cancelReason?:BrowserRun["cancelReason"]; timeoutMs?:number; status?: BrowserRunStatus; finalUrl?: string; steps?: number; result?: BrowserResearchResult; error?: string; finishedAt?: string; finalThumbnail?: string }) {
    const current = this.get(runId);
    if (!current) return;
    this.db.run("UPDATE browser_runs SET error_code=?,cancel_reason=?,timeout_ms=? WHERE id=?", [patch.errorCode??current.errorCode??null,patch.cancelReason??current.cancelReason??null,patch.timeoutMs??current.timeoutMs??null,runId]);
    this.db.run(
      "UPDATE browser_runs SET status=?,final_url=?,steps=?,result_json=?,error=?,finished_at=?,final_thumbnail=? WHERE id=?",
      [
        patch.status ?? current.status,
        patch.finalUrl ?? current.currentUrl ?? null,
        patch.steps ?? current.stepCount,
        JSON.stringify(patch.result ?? current.finalResult ?? null),
        patch.error ?? current.error ?? null,
        patch.finishedAt ?? current.finishedAt ?? null,
        patch.finalThumbnail ?? current.finalThumbnail ?? null,
        runId
      ]
    );
  }

  recordEvent(event: BrowserRunEvent) {
    const label = event.type === "browser.step" ? event.label : event.type === "browser.failed" ? event.error : event.type === "browser.approval_requested" ? event.label : null;
    const url = event.type === "browser.navigation" ? event.url : null;
    this.db.run(
      "INSERT INTO browser_run_events(id,browser_run_id,type,label,url,created_at) VALUES(?,?,?,?,?,?)",
      [event.id ?? randomUUID(), event.runId, event.type, label, url, event.timestamp]
    );
  }

  list(conversationId?: string) {
    const rows = conversationId
      ? this.db.all<any>("SELECT * FROM browser_runs WHERE conversation_id=? ORDER BY started_at DESC", [conversationId])
      : this.db.all<any>("SELECT * FROM browser_runs ORDER BY started_at DESC");
    return rows.map(row => this.map(row));
  }
  get(id: string) { const row = this.db.get<any>("SELECT * FROM browser_runs WHERE id=?", [id]); return row ? this.map(row) : undefined; }
  latestActive(conversationId: string) {
    const row = this.db.get<any>("SELECT * FROM browser_runs WHERE conversation_id=? AND status IN ('starting','running','paused','waiting_approval') ORDER BY started_at DESC LIMIT 1", [conversationId]);
    return row ? this.map(row) : undefined;
  }
  recoverInterrupted() {
    this.db.run("UPDATE browser_runs SET status='failed',error='Execução interrompida pelo encerramento do aplicativo.',finished_at=? WHERE status IN ('starting','running','paused','waiting_approval')", [new Date().toISOString()]);
  }
  events(runId: string) {
    return this.db.all<{ id:string; browser_run_id:string; type:string; label:string|null; url:string|null; created_at:string }>("SELECT * FROM browser_run_events WHERE browser_run_id=? ORDER BY created_at", [runId]);
  }

  personalProfileEnabled() {
    return this.db.get<{ value:string }>("SELECT value FROM application_state WHERE key=?", [PERSONAL_PROFILE_SETTING])?.value === "true";
  }
  setPersonalProfileEnabled(enabled: boolean) {
    this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)", [PERSONAL_PROFILE_SETTING, String(enabled)]);
    return enabled;
  }

  private map(row: any): BrowserRun {
    return {
      id: row.id,
      errorCode: row.error_code ?? undefined,
      cancelReason: row.cancel_reason ?? undefined,
      timeoutMs: row.timeout_ms ?? undefined,
      taskId: row.task_id,
      conversationId: row.conversation_id,
      request: row.request,
      status: row.status as BrowserRunStatus,
      mode: row.mode as BrowserAgentMode,
      allowedDomains: JSON.parse(row.allowed_domains_json ?? "[]"),
      currentUrl: row.final_url ?? row.start_url ?? undefined,
      stepCount: Number(row.steps ?? 0),
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      finalResult: row.result_json ? JSON.parse(row.result_json) : undefined,
      finalThumbnail: row.final_thumbnail ?? undefined,
      error: row.error ?? undefined
    };
  }

  private ensureSchema() {
    this.db.run(`CREATE TABLE IF NOT EXISTS browser_runs (id TEXT PRIMARY KEY,task_id TEXT,conversation_id TEXT,request TEXT NOT NULL,status TEXT NOT NULL,start_url TEXT,final_url TEXT,allowed_domains_json TEXT,mode TEXT NOT NULL,steps INTEGER DEFAULT 0,result_json TEXT,error TEXT,started_at TEXT NOT NULL,finished_at TEXT,final_thumbnail TEXT)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS browser_run_events (id TEXT PRIMARY KEY,browser_run_id TEXT NOT NULL,type TEXT NOT NULL,label TEXT,url TEXT,created_at TEXT NOT NULL)`);
    const columns = new Set(this.db.all<{name:string}>("PRAGMA table_info(browser_runs)").map(row=>row.name));
    for (const [name,type] of [["error_code","TEXT"],["cancel_reason","TEXT"],["timeout_ms","INTEGER"]]) if (!columns.has(name)) this.db.run(`ALTER TABLE browser_runs ADD COLUMN ${name} ${type}`);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_browser_runs_conversation ON browser_runs(conversation_id,started_at)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_browser_run_events_run ON browser_run_events(browser_run_id,created_at)");
  }
}
