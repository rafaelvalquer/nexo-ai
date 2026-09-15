export interface PollingPolicy { minIntervalMs: number; maxDurationMs: number; maxAttempts: number; progressFields?: string[]; }
export class PollingController {
  private attempts = 0; private readonly startedAt = Date.now(); private lastAttemptAt = 0;
  constructor(private readonly policy: PollingPolicy) { if (policy.minIntervalMs < 0 || policy.maxDurationMs <= 0 || policy.maxAttempts <= 0) throw new Error("Política de polling inválida."); }
  async wait(signal?: AbortSignal) { if (++this.attempts > this.policy.maxAttempts || Date.now() - this.startedAt > this.policy.maxDurationMs) throw new Error("external_wait_timeout"); const delay = Math.max(0, this.policy.minIntervalMs - (Date.now() - this.lastAttemptAt)); if (delay) await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, delay); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new DOMException("Cancelado", "AbortError")); }, { once: true }); }); this.lastAttemptAt = Date.now(); }
}
