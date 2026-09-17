import { randomUUID } from "node:crypto";
import type { NexoDatabase } from "../database/db.js";

type Sample = { id: string; metric: string; value: number; tags: string; createdAt: string };
type Logger = { warn: (message: string) => void };
const INTERVAL_MS = 5_000;
const MAX_PENDING = 10_000;

/** Best-effort telemetry. Operational/approval writes never pass through this buffer. */
export class LocalMetricsService {
  private pending = new Map<string, Sample>();
  private timer?: ReturnType<typeof setTimeout>;
  private urgent?: ReturnType<typeof setImmediate>;
  private closed = false;
  private retrying = false;
  private warnedOverflow = false;

  constructor(private db: NexoDatabase, private logger: Logger = console) {}

  record(metric: string, value: number, tags: Record<string, string | number | boolean> = {}) {
    if (this.closed) return;
    const sample = { id: randomUUID(), metric, value, tags: JSON.stringify(tags), createdAt: new Date().toISOString() };
    this.pending.set(sample.id, sample);
    if (this.pending.size > MAX_PENDING) {
      this.pending.delete(this.pending.keys().next().value!);
      if (!this.warnedOverflow) {
        this.logger.warn("Buffer de telemetria cheio; amostras antigas excedentes foram descartadas.");
        this.warnedOverflow = true;
      }
    }
    this.schedule();
    if (this.pending.size >= MAX_PENDING && !this.urgent && !this.retrying) {
      this.urgent = setImmediate(() => { this.urgent = undefined; this.flush(); });
      this.urgent.unref?.();
    }
  }

  private schedule() {
    if (this.closed || this.timer || !this.pending.size) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, INTERVAL_MS);
    this.timer.unref?.();
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.urgent) clearImmediate(this.urgent);
    this.timer = undefined;
    this.urgent = undefined;
  }

  flush(): boolean {
    this.clearTimers();
    if (!this.pending.size) return true;
    try {
      this.db.transaction(() => {
        for (const sample of this.pending.values()) {
          // The previous commit may have succeeded in memory before disk export failed.
          this.db.run("INSERT OR IGNORE INTO local_metrics(id,metric,value,tags_json,created_at) VALUES(?,?,?,?,?)",
            [sample.id, sample.metric, sample.value, sample.tags, sample.createdAt]);
        }
      });
      this.pending.clear();
      this.retrying = false;
      this.warnedOverflow = false;
      return true;
    } catch (error) {
      this.retrying = true;
      this.logger.warn(`Falha ao persistir telemetria: ${String(error)}`);
      this.schedule();
      return false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.flush();
  }

  private unpersistedSamples() {
    if (!this.retrying) return [...this.pending.values()];
    const committed = new Set<string>();
    const ids = [...this.pending.keys()];
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      for (const row of this.db.all<{ id: string }>(`SELECT id FROM local_metrics WHERE id IN (${batch.map(() => "?").join(",")})`, batch)) committed.add(row.id);
    }
    return [...this.pending.values()].filter(sample => !committed.has(sample.id));
  }

  latest(metric: string): string | undefined {
    let latest = this.db.get<{ latest: string | null }>("SELECT MAX(created_at) AS latest FROM local_metrics WHERE metric=?", [metric])?.latest ?? undefined;
    for (const sample of this.pending.values()) if (sample.metric === metric && (!latest || sample.createdAt > latest)) latest = sample.createdAt;
    return latest;
  }

  snapshot() {
    const rows = this.db.all<{ metric: string; count: number; total: number; latest: string }>(
      "SELECT metric,COUNT(*) AS count,SUM(value) AS total,MAX(created_at) AS latest FROM local_metrics GROUP BY metric");
    const totals = new Map(rows.map(row => [row.metric, { ...row }]));
    for (const sample of this.unpersistedSamples()) {
      const row = totals.get(sample.metric) ?? { metric: sample.metric, count: 0, total: 0, latest: sample.createdAt };
      row.count++;
      row.total += sample.value;
      if (sample.createdAt > row.latest) row.latest = sample.createdAt;
      totals.set(sample.metric, row);
    }
    return [...totals.values()].sort((a, b) => a.metric.localeCompare(b.metric)).map(row => ({
      metric: row.metric, count: row.count, average: Math.round(row.total / row.count * 100) / 100, latest: row.latest
    }));
  }
}
