import chokidar, { type FSWatcher } from "chokidar";
import { Cron } from "croner";
import type { AutomationTrigger, AutomationV2 } from "@nexo/shared";

export type AutomationTriggerPayload = Record<string, unknown>;
export type AutomationTriggerEmitter = (automation: AutomationV2, payload: AutomationTriggerPayload) => Promise<unknown> | unknown;

export class AutomationScheduler {
  private cronJobs = new Map<string, Cron>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private emit: AutomationTriggerEmitter) {}

  install(automation: AutomationV2): void {
    this.uninstall(automation.id);
    if (!automation.enabled) return;
    const trigger = automation.trigger;
    if (trigger.type === "schedule") this.installSchedule(automation, trigger);
    else if (trigger.type === "interval") this.installInterval(automation, trigger.minutes);
    else if (trigger.type === "file.created" || trigger.type === "file.changed" || trigger.type === "file.deleted") this.installFile(automation);
    else if (trigger.type === "app-start") queueMicrotask(() => void this.emit(automation, { source: "app-start" }));
  }

  uninstall(id: string): void {
    this.cronJobs.get(id)?.stop();
    this.cronJobs.delete(id);
    const interval = this.intervals.get(id);
    if (interval) clearInterval(interval);
    this.intervals.delete(id);
    void this.watchers.get(id)?.close();
    this.watchers.delete(id);
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${id}:`)) { clearTimeout(timer); this.debounceTimers.delete(key); }
    }
  }

  stopAll(): void {
    for (const id of new Set([...this.cronJobs.keys(), ...this.intervals.keys(), ...this.watchers.keys()])) this.uninstall(id);
  }

  nextRun(automation: AutomationV2, from = new Date()): string | undefined {
    if (!automation.enabled) return undefined;
    const trigger = automation.trigger;
    if (trigger.type === "interval") return new Date(from.getTime() + Math.max(1, trigger.minutes) * 60_000).toISOString();
    if (trigger.type !== "schedule") return undefined;
    if (trigger.mode === "once" && trigger.at) {
      const at = new Date(trigger.at);
      return Number.isNaN(at.getTime()) || at <= from ? undefined : at.toISOString();
    }
    const pattern = trigger.cron ?? scheduleToCron(trigger);
    if (!pattern) return undefined;
    const probe = new Cron(pattern, { paused: true });
    const next = probe.nextRun(from);
    probe.stop();
    return next?.toISOString();
  }

  private installSchedule(automation: AutomationV2, trigger: Extract<AutomationTrigger, { type: "schedule" }>): void {
    const run = () => void this.emit(automation, { source: "schedule", scheduledAt: new Date().toISOString() });
    if (trigger.mode === "once" && trigger.at) {
      this.cronJobs.set(automation.id, new Cron(trigger.at, { maxRuns: 1, protect: true }, run));
      return;
    }
    const pattern = trigger.cron ?? scheduleToCron(trigger);
    if (pattern) this.cronJobs.set(automation.id, new Cron(pattern, { protect: true }, run));
  }

  private installInterval(automation: AutomationV2, minutes: number): void {
    const duration = Math.max(1, minutes) * 60_000;
    const timer = setInterval(() => void this.emit(automation, { source: "interval", intervalMinutes: minutes, firedAt: new Date().toISOString() }), duration);
    timer.unref?.();
    this.intervals.set(automation.id, timer);
  }

  private installFile(automation: AutomationV2): void {
    const trigger = automation.trigger;
    if (trigger.type !== "file.created" && trigger.type !== "file.changed" && trigger.type !== "file.deleted") return;
    const watcher = chokidar.watch(trigger.path, { ignoreInitial: true });
    const event = trigger.type === "file.created" ? "add" : trigger.type === "file.changed" ? "change" : "unlink";
    watcher.on(event, filePath => this.emitFileDebounced(automation, filePath, event, trigger.debounceMs ?? 1500));
    this.watchers.set(automation.id, watcher);
  }

  private emitFileDebounced(automation: AutomationV2, filePath: string, event: string, debounceMs: number): void {
    const key = `${automation.id}:${filePath}:${event}`;
    const previous = this.debounceTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      void this.emit(automation, { source: "filesystem", path: filePath, event });
    }, Math.max(0, debounceMs));
    this.debounceTimers.set(key, timer);
  }
}

export function scheduleToCron(trigger: Extract<AutomationTrigger, { type: "schedule" }>): string | undefined {
  if (trigger.cron) return trigger.cron;
  if (!trigger.time) return undefined;
  const [hourText, minuteText] = trigger.time.split(":");
  const hour = Number(hourText), minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  if (trigger.mode === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (trigger.mode === "weekends") return `${minute} ${hour} * * 0,6`;
  if (trigger.mode === "specific-days" || trigger.mode === "weekly") return `${minute} ${hour} * * ${(trigger.daysOfWeek?.length ? trigger.daysOfWeek : [1]).join(",")}`;
  if (trigger.mode === "monthly") return `${minute} ${hour} ${trigger.dayOfMonth ?? 1} * *`;
  return `${minute} ${hour} * * *`;
}
