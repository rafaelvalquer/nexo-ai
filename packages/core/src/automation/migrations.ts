import { NexoDatabase } from "../database/db.js";

const AUTOMATION_SCHEMA_VERSION = 5;

/** Domain migration kept separate so Automation V2 can evolve without coupling the scheduler to SQL. */
export function migrateAutomationSchema(db: NexoDatabase): void {
  const current = db.get<{ value: string }>("SELECT value FROM application_state WHERE key='automation_schema_version'");
  if (Number(current?.value ?? 0) >= AUTOMATION_SCHEMA_VERSION) return;
  db.transaction(() => {
    const columns = new Set(db.all<{ name: string }>("PRAGMA table_info(automations)").map(column => String(column.name)));
    const additions: Array<[string, string]> = [
      ["version", "INTEGER DEFAULT 1"],
      ["description", "TEXT"],
      ["icon", "TEXT"],
      ["trigger_json", "TEXT"],
      ["conditions_json", "TEXT"],
      ["condition_operator", "TEXT DEFAULT 'AND'"],
      ["actions_json", "TEXT"],
      ["output_json", "TEXT"],
      ["policy_json", "TEXT"],
      ["updated_at", "TEXT"],
      ["next_run_at", "TEXT"],
      ["last_run_status", "TEXT"],
      ["consecutive_failures", "INTEGER DEFAULT 0"]
      ,["prompt", "TEXT"]
    ];
    for (const [name, type] of additions) if (!columns.has(name)) db.run(`ALTER TABLE automations ADD COLUMN ${name} ${type}`);
    db.run("UPDATE automations SET output_json=?,prompt=?,version=2,updated_at=? WHERE name=? AND (output_json IS NULL OR output_json NOT LIKE '%\"type\":\"chat\"%')", [JSON.stringify({ type: "chat", conversationMode: "automation" }), "Resuma meus e-mails não lidos e destaque os que exigem ação.", new Date().toISOString(), "Resumir e-mails não lidos"]);
    db.run("CREATE TABLE IF NOT EXISTS automation_runs(id TEXT PRIMARY KEY,automation_id TEXT NOT NULL,trigger_type TEXT NOT NULL,trigger_payload_json TEXT,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,duration_ms INTEGER,summary TEXT,error TEXT,task_id TEXT,conversation_id TEXT,approval_id TEXT,context_json TEXT,next_action_index INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(automation_id) REFERENCES automations(id))");
    const runColumns = new Set(db.all<{ name: string }>("PRAGMA table_info(automation_runs)").map(column => String(column.name)));
    if (!runColumns.has("conversation_id")) db.run("ALTER TABLE automation_runs ADD COLUMN conversation_id TEXT");
    db.run("CREATE TABLE IF NOT EXISTS automation_run_steps(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,ordinal INTEGER NOT NULL,action_id TEXT NOT NULL,action_type TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,duration_ms INTEGER,summary TEXT,error TEXT,approval_id TEXT,FOREIGN KEY(run_id) REFERENCES automation_runs(id))");
    db.run("CREATE TABLE IF NOT EXISTS automation_trigger_state(automation_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(automation_id) REFERENCES automations(id))");
    db.run("CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_started ON automation_runs(automation_id,started_at)");
    db.run("CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_automation_run_steps_run ON automation_run_steps(run_id,ordinal)");
    db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES('automation_schema_version',?)", [String(AUTOMATION_SCHEMA_VERSION)]);
  });
}
