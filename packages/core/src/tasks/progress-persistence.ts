/**
 * Coalesces streaming writes so sql.js is not exported once per generated token.
 * Status transitions still call flush() directly and remain durable immediately.
 */
export class ProgressPersistenceScheduler {
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly delayMs: number, private readonly persist: (taskId: string) => void) {}

  schedule(taskId: string) {
    if (this.pending.has(taskId)) return;
    this.pending.set(taskId, setTimeout(() => this.flush(taskId), this.delayMs));
  }

  flush(taskId: string) {
    const timer = this.pending.get(taskId);
    if (timer) clearTimeout(timer);
    this.pending.delete(taskId);
    this.persist(taskId);
  }

  cancel(taskId: string) {
    const timer = this.pending.get(taskId);
    if (timer) clearTimeout(timer);
    this.pending.delete(taskId);
  }
}
