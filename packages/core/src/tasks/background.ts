import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";
import type { AgentReply } from "../agent/engine.js";
import { ProgressPersistenceScheduler } from "./progress-persistence.js";

export type BackgroundTaskStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";

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
  statusHistory?: string[];
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
  progress_json?: string | null;
};

type LiveProgress = {
  text: string;
  statusMessage: string;
  statusHistory: string[];
};

export class BackgroundTaskService {
  private liveProgress = new Map<string, LiveProgress>();
  private liveResults = new Map<string, unknown>();
  private liveErrors = new Map<string, string>();
  private progressPersistence: ProgressPersistenceScheduler;

  constructor(private db: NexoDatabase, private readonly isPrivate = () => false) {
    this.progressPersistence = new ProgressPersistenceScheduler(350, id => this.persistProgress(id));
  }

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
      "INSERT INTO tasks(id,type,status,input_json,result_json,error,created_at,started_at,finished_at,progress_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [id, type, "queued", JSON.stringify(this.isPrivate() ? { privateMode: true } : input), null, null, createdAt, null, null, JSON.stringify({ text: "", statusMessage: "Na fila…", statusHistory: ["Na fila…"] })]
    );
    this.liveProgress.set(id, { text: "", statusMessage: "Na fila…", statusHistory: ["Na fila…"] });
    return this.get(id)!;
  }

  markRunning(id: string) {
    this.db.run("UPDATE tasks SET status='running', started_at=? WHERE id=?", [new Date().toISOString(), id]);
    this.setStatus(id, "Iniciando processamento local…");
  }

  setStatus(id: string, statusMessage: string) {
    if (!this.isActive(id)) return;
    const current = this.liveProgress.get(id) ?? { text: "", statusMessage: "", statusHistory: [] };
    const history = [...current.statusHistory];
    if (statusMessage && history.at(-1) !== statusMessage) history.push(statusMessage);
    this.liveProgress.set(id, {
      ...current,
      statusMessage,
      statusHistory: history.slice(-8)
    });
    this.persistProgress(id);
  }

  appendProgress(id: string, token: string) {
    if (!this.isActive(id)) return;
    const current = this.liveProgress.get(id) ?? {
      text: "",
      statusMessage: "Gerando resposta…",
      statusHistory: ["Gerando resposta…"]
    };
    this.liveProgress.set(id, { ...current, text: current.text + token });
    this.progressPersistence.schedule(id);
  }

  replaceProgress(id: string, text: string) {
    if (!this.isActive(id)) return;
    const current = this.liveProgress.get(id) ?? { text: "", statusMessage: "", statusHistory: [] };
    this.liveProgress.set(id, { ...current, text });
    this.progressPersistence.schedule(id);
  }

  complete(id: string, result: unknown) {
    this.progressPersistence.cancel(id);
    const privateMode = this.isPrivate();
    if (privateMode) this.liveResults.set(id, result);
    this.db.run(
      "UPDATE tasks SET status='completed', result_json=?, finished_at=?, progress_json=? WHERE id=?",
      [privateMode ? null : JSON.stringify(result), new Date().toISOString(), null, id]
    );
    this.liveProgress.delete(id);
  }

  fail(id: string, error: unknown) {
    this.progressPersistence.cancel(id);
    const message = error instanceof Error ? error.message : String(error);
    const privateMode = this.isPrivate();
    if (privateMode) this.liveErrors.set(id, message);
    this.db.run(
      "UPDATE tasks SET status='failed', error=?, finished_at=?, progress_json=? WHERE id=?",
      [privateMode ? "Tarefa privada falhou." : message, new Date().toISOString(), null, id]
    );
    this.liveProgress.delete(id);
  }
  markWaitingApproval(id: string, approvalId: string) {
    const current=this.liveProgress.get(id) ?? {text:"",statusMessage:"",statusHistory:[]};
    const statusMessage="Aguardando sua aprovação…";
    this.liveProgress.set(id,{...current,statusMessage,statusHistory:[...current.statusHistory,statusMessage].slice(-8)});
    this.db.run("UPDATE tasks SET status='waiting_approval', progress_json=? WHERE id=?",[JSON.stringify(this.liveProgress.get(id)),id]);
    return approvalId;
  }

  cancel(id: string) {
    const task = this.get(id);
    if (!task || !["queued", "running", "waiting_approval"].includes(task.status)) return false;
    this.progressPersistence.cancel(id);
    this.db.run(
      "UPDATE tasks SET status='cancelled', error=?, finished_at=?, progress_json=? WHERE id=?",
      ["Cancelada pelo usuário.", new Date().toISOString(), null, id]
    );
    this.liveProgress.delete(id);
    return true;
  }

  get(id: string): BackgroundTask | undefined {
    const row = this.db.get<TaskRow>("SELECT * FROM tasks WHERE id=?", [id]);
    if (!row) return undefined;
    const task = this.toTask(row);
    return { ...task, result: this.liveResults.get(id) ?? task.result, error: this.liveErrors.get(id) ?? task.error };
  }

  list(limit = 50): BackgroundTask[] {
    return this.db
      .all<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", [limit])
      .map(row => this.toTask(row));
  }

  listActive(): BackgroundTask[] {
    return this.db
      .all<TaskRow>("SELECT * FROM tasks WHERE status IN ('queued','running','waiting_approval') ORDER BY created_at ASC")
      .map(row => this.toTask(row));
  }

  private toTask(row: TaskRow): BackgroundTask {
    const progress = this.liveProgress.get(row.id) ?? (row.progress_json ? JSON.parse(row.progress_json) as LiveProgress : undefined);
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
      statusMessage: progress?.statusMessage,
      statusHistory: progress?.statusHistory
    };
  }

  private persistProgress(id: string) {
    const progress = this.liveProgress.get(id);
    if (progress) this.db.run("UPDATE tasks SET progress_json=? WHERE id=?", [JSON.stringify(progress), id]);
  }

  private isActive(id: string) {
    return Boolean(this.db.get("SELECT id FROM tasks WHERE id=? AND status IN ('queued','running','waiting_approval')", [id]));
  }
}
