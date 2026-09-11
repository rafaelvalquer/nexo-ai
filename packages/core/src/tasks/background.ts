import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";
import type { AgentReply } from "../agent/engine.js";

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type BackgroundTask = {
  id: string;
  type: string;
  status: BackgroundTaskStatus;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progressText?: string;
  statusMessage?: string;
};

type TaskRow = {
  id: string;
  type: string;
  status: BackgroundTaskStatus;
  input_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type LiveProgress = { text: string; statusMessage: string };

export class BackgroundTaskService {
  private liveProgress = new Map<string, LiveProgress>();

  constructor(private db: NexoDatabase) {}

  recoverInterruptedTasks() {
    const now = new Date().toISOString();
    const active = this.db.all<TaskRow>("SELECT * FROM tasks WHERE status IN ('queued','running')");
    for (const row of active) {
      this.db.run(
        "UPDATE tasks SET status='failed', error=?, finished_at=? WHERE id=?",
        ["A tarefa foi interrompida por um encerramento anterior do Nexo.", now, row.id]
      );
    }
  }

  create(type: string, input: Record<string, unknown>) {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.run(
      "INSERT INTO tasks(id,type,status,input_json,result_json,error,created_at,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [id, type, "queued", JSON.stringify(input), null, null, createdAt, null, null]
    );
    this.liveProgress.set(id, { text: "", statusMessage: "Na fila…" });
    return this.get(id)!;
  }

  markRunning(id: string) {
    this.db.run("UPDATE tasks SET status='running', started_at=? WHERE id=?", [new Date().toISOString(), id]);
    this.setStatus(id, "Iniciando processamento local…");
  }

  setStatus(id: string, statusMessage: string) {
    const current = this.liveProgress.get(id) ?? { text: "", statusMessage: "" };
    this.liveProgress.set(id, { ...current, statusMessage });
  }

  appendProgress(id: string, token: string) {
    const current = this.liveProgress.get(id) ?? { text: "", statusMessage: "Gerando resposta…" };
    this.liveProgress.set(id, { ...current, text: current.text + token });
  }

  replaceProgress(id: string, text: string) {
    const current = this.liveProgress.get(id) ?? { text: "", statusMessage: "" };
    this.liveProgress.set(id, { ...current, text });
  }

  complete(id: string, result: AgentReply) {
    this.db.run(
      "UPDATE tasks SET status='completed', result_json=?, finished_at=? WHERE id=?",
      [JSON.stringify(result), new Date().toISOString(), id]
    );
    this.liveProgress.delete(id);
  }

  fail(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.db.run(
      "UPDATE tasks SET status='failed', error=?, finished_at=? WHERE id=?",
      [message, new Date().toISOString(), id]
    );
    this.liveProgress.delete(id);
  }

  get(id: string): BackgroundTask | undefined {
    const row = this.db.get<TaskRow>("SELECT * FROM tasks WHERE id=?", [id]);
    return row ? this.toTask(row) : undefined;
  }

  list(limit = 50): BackgroundTask[] {
    return this.db
      .all<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", [limit])
      .map(row => this.toTask(row));
  }

  listActive(): BackgroundTask[] {
    return this.db
      .all<TaskRow>("SELECT * FROM tasks WHERE status IN ('queued','running') ORDER BY created_at ASC")
      .map(row => this.toTask(row));
  }

  private toTask(row: TaskRow): BackgroundTask {
    const progress = this.liveProgress.get(row.id);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      input: JSON.parse(row.input_json || "{}"),
      result: row.result_json ? JSON.parse(row.result_json) : undefined,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      progressText: progress?.text,
      statusMessage: progress?.statusMessage
    };
  }
}
