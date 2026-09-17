import type { CoreModule, ModuleSnapshot, ModuleStatus } from "./module.js";

type Entry = { module: CoreModule; status: ModuleStatus; error?: string; transition?: Promise<void> };

/** Starts optional capabilities only when a caller needs them and resolves dependencies once. */
export class CoreModuleManager {
  private readonly entries = new Map<string, Entry>();

  register(module: CoreModule): void {
    if (!module.id.trim()) throw new Error("O módulo precisa de um identificador.");
    if (this.entries.has(module.id)) throw new Error(`Módulo já registrado: ${module.id}`);
    this.entries.set(module.id, { module, status: "disabled" });
  }

  async enable(id: string): Promise<void> { await this.start(id, []); }

  async ensure<T extends CoreModule = CoreModule>(id: string): Promise<T> {
    await this.enable(id);
    return this.require(id).module as T;
  }

  async disable(id: string): Promise<void> {
    const entry = this.require(id);
    const dependents = [...this.entries.values()].filter(candidate => candidate.status === "ready" && candidate.module.dependencies?.includes(id));
    for (const dependent of dependents) await this.disable(dependent.module.id);
    if (entry.transition) await entry.transition.catch(() => undefined);
    if (entry.status !== "ready" && entry.status !== "error") { entry.status = "disabled"; return; }
    try {
      await entry.module.stop();
      entry.status = "disabled";
      entry.error = undefined;
    } catch (error) {
      entry.status = "error";
      entry.error = toMessage(error);
      throw error;
    }
  }

  status(id: string): ModuleStatus { return this.require(id).status; }
  snapshot(): ModuleSnapshot[] { return [...this.entries.values()].map(({ module, status, error }) => ({ id: module.id, status, ...(error ? { error } : {}) })); }

  async shutdown(): Promise<void> {
    const enabled = [...this.entries.values()].filter(entry => entry.status === "ready").map(entry => entry.module.id);
    for (const id of enabled.reverse()) await this.disable(id);
  }

  private async start(id: string, stack: string[]): Promise<void> {
    if (stack.includes(id)) throw new Error(`Dependência circular entre módulos: ${[...stack, id].join(" → ")}`);
    const entry = this.require(id);
    if (entry.status === "ready") return;
    if (entry.transition) return entry.transition;
    entry.status = "starting";
    entry.error = undefined;
    entry.transition = (async () => {
      try {
        for (const dependency of entry.module.dependencies ?? []) await this.start(dependency, [...stack, id]);
        await entry.module.start();
        entry.status = "ready";
      } catch (error) {
        entry.status = "error";
        entry.error = toMessage(error);
        throw error;
      } finally {
        entry.transition = undefined;
      }
    })();
    return entry.transition;
  }

  private require(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Módulo não registrado: ${id}`);
    return entry;
  }
}

function toMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
