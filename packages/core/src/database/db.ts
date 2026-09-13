import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { defaultDataDir } from "../shared/paths.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT,
    confidence REAL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, input_json TEXT NOT NULL, risk TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL, trigger_type TEXT NOT NULL, schedule TEXT, watch_path TEXT, command TEXT NOT NULL, last_run_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, risk TEXT NOT NULL, status TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS application_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
`;

const MIGRATIONS: Array<[number, string]> = [[1, `
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, provider TEXT NOT NULL, account_email TEXT, display_name TEXT, capabilities_json TEXT NOT NULL, token_secret_key TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_error TEXT);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, managed_path TEXT NOT NULL, source_hash TEXT NOT NULL, status TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, locator TEXT, text TEXT NOT NULL, embedding_json TEXT, FOREIGN KEY(document_id) REFERENCES documents(id));
CREATE TABLE IF NOT EXISTS message_attachments (id TEXT PRIMARY KEY, message_id TEXT, document_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_versions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, version_number INTEGER NOT NULL, managed_path TEXT NOT NULL, change_summary TEXT, created_at TEXT NOT NULL);
ALTER TABLE tasks ADD COLUMN progress_json TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(source_hash);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id, ordinal);
`], [2, `
ALTER TABLE connections ADD COLUMN last_connected_at TEXT;
ALTER TABLE connections ADD COLUMN last_validated_at TEXT;
ALTER TABLE connections ADD COLUMN last_refresh_at TEXT;
ALTER TABLE connections ADD COLUMN token_expires_at TEXT;
ALTER TABLE connections ADD COLUMN provider_account_id TEXT;
`], [3, `
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  user_request TEXT NOT NULL,
  status TEXT NOT NULL,
  state_json TEXT NOT NULL,
  final_response TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  tool_name TEXT,
  input_json TEXT,
  status TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  approval_id TEXT,
  state_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);
ALTER TABLE approvals ADD COLUMN agent_run_id TEXT;
ALTER TABLE approvals ADD COLUMN checkpoint_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_run ON agent_checkpoints(run_id, status);
`], [4, `
CREATE TABLE IF NOT EXISTS local_metrics (
  id TEXT PRIMARY KEY,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  tags_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_metrics_metric_created ON local_metrics(metric, created_at);
`], [5, `
ALTER TABLE approvals ADD COLUMN visual_run_id TEXT;
ALTER TABLE approvals ADD COLUMN task_id TEXT;
CREATE TABLE IF NOT EXISTS visual_runs (run_id TEXT PRIMARY KEY, task_id TEXT, agent_run_id TEXT, state TEXT NOT NULL, station_id TEXT, label TEXT NOT NULL, severity TEXT, updated_at TEXT NOT NULL, completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_visual_runs_updated ON visual_runs(updated_at);
`], [6, `
ALTER TABLE visual_runs ADD COLUMN event_type TEXT;
ALTER TABLE visual_runs ADD COLUMN event_id TEXT;
ALTER TABLE visual_runs ADD COLUMN approval_id TEXT;
`]];

export class NexoDatabase {
  private db!: Database;
  private filePath: string;
  private readyPromise: Promise<void>;
  private transactionDepth = 0;

  constructor(dataDir = defaultDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "nexo.db");
    this.readyPromise = this.init();
  }

  private async init() {
    const SQL = await initSqlJs();
    const bytes = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    
    // Migração: se a tabela memories existir e não tiver a coluna 'key', renomear para legacy_memories
    const hasMemories = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'")[0]?.values.length > 0;
    if (hasMemories) {
      const columns = this.db.exec("PRAGMA table_info(memories)")[0]?.values.map(v => v[1]);
      if (!columns?.includes('key')) {
        this.db.run("ALTER TABLE memories RENAME TO legacy_memories");
      }
    }
    
    this.db.run(SCHEMA);
    this.db.run("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const [version, sql] of MIGRATIONS) {
      if (this.db.exec(`SELECT version FROM schema_migrations WHERE version=${version}`)[0]?.values.length) continue;
      // sql.js aborts a multi-statement script at the first duplicate ALTER.
      // Apply statements independently so an older development build with one
      // pre-existing column still receives every later table/index/column.
      for (const statement of sql.split(";").map(part => part.trim()).filter(Boolean)) {
        try { this.db.run(statement); }
        catch (error) {
          // SQLite has no ADD COLUMN IF NOT EXISTS. Only this expected race is
          // recoverable; all other errors leave the migration unapplied.
          if (!String(error).includes("duplicate column name")) throw error;
        }
      }
      this.db.run("INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES(?, ?)", [version, new Date().toISOString()]);
    }
    this.persist();
  }

  async ready() { await this.readyPromise; }

  run(sql: string, params: unknown[] = []) {
    this.db.run(sql, params as any[]);
    if (!this.transactionDepth) this.persist();
  }

  /** Executes synchronous database work atomically and exports sql.js only once. */
  transaction<T>(work: () => T): T {
    const outermost = this.transactionDepth === 0;
    if (outermost) this.db.run("BEGIN");
    this.transactionDepth++;
    try {
      const result = work();
      this.transactionDepth--;
      if (outermost) { this.db.run("COMMIT"); this.persist(); }
      return result;
    } catch (error) {
      this.transactionDepth--;
      if (outermost) { this.db.run("ROLLBACK"); this.persist(); }
      throw error;
    }
  }

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as any[]);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  private persist() {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.filePath, Buffer.from(data));
  }

  backup() {
    const backupDir = path.join(path.dirname(this.filePath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(backupDir, `${stamp}.db`);
    fs.copyFileSync(this.filePath, dest);
    return dest;
  }
}
