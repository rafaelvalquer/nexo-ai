import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { defaultDataDir } from "../shared/paths.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
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
`;

export class NexoDatabase {
  private db!: Database;
  private filePath: string;
  private readyPromise: Promise<void>;

  constructor(dataDir = defaultDataDir()) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "nexo.db");
    this.readyPromise = this.init();
  }

  private async init() {
    const SQL = await initSqlJs();
    const bytes = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.db.run(SCHEMA);
    this.persist();
  }

  async ready() { await this.readyPromise; }

  run(sql: string, params: unknown[] = []) {
    this.db.run(sql, params as any[]);
    this.persist();
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
