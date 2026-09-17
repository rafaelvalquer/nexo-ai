import type { Automation, AutomationExecutionResult } from "@nexo/shared";
import type { AutomationEngine } from "../automation/engine.js";
import type { CreateMacroInput, MacroDraft, MacroDryRun, MacroRun, MacroView, UpdateMacroInput } from "./types.js";

/** Public macro API. The adapter keeps the existing persisted automation format compatible. */
export class MacroEngine {
  constructor(private readonly legacy: AutomationEngine) {}

  list(): MacroView[] { return this.legacy.list(); }
  get(id: string): MacroView | undefined { return this.legacy.get(id); }
  create(input: CreateMacroInput | Omit<Automation, "id" | "lastRunAt">): MacroView { return this.legacy.create(input); }
  update(id: string, input: UpdateMacroInput): MacroView { return this.legacy.update(id, input); }
  remove(id: string): void { this.legacy.remove(id); }
  async run(id: string): Promise<MacroRun> {
    const result = await this.legacy.runManual(id);
    if (result && "runId" in result) {
      const run = this.legacy.getRun(result.runId);
      if (run) return run;
    }
    const latest = this.legacy.listRuns(id, 1)[0];
    if (!latest) throw new Error("A macro não iniciou uma execução.");
    return this.legacy.getRun(latest.id) ?? latest;
  }
  cancel(runOrMacroId: string): boolean { return this.legacy.cancel(this.legacy.getRun(runOrMacroId)?.automationId ?? runOrMacroId); }
  retry(runId: string, stepId?: string): Promise<MacroRun> {
    if (stepId) {
      const run = this.legacy.getRun(runId);
      if (!run?.steps?.some(step => step.id === stepId && step.status === "failed")) throw new Error("A etapa informada não corresponde à falha desta execução.");
    }
    return this.legacy.resumeFailedRun(runId, "retry");
  }
  resume(runId: string): Promise<MacroRun> { return this.legacy.resumeFailedRun(runId, "continue"); }
  test(input: string | MacroDraft): Promise<MacroDryRun> { return typeof input === "string" ? this.legacy.test(input) : this.legacy.testDraft(input); }

  /** Temporary API aliases used by existing IPC handlers while renderer contracts migrate. */
  start(): void { this.legacy.start(); }
  stop(): void { this.legacy.stop(); }
  presets() { return this.legacy.presets(); }
  actionCatalog() { return this.legacy.actionCatalog(); }
  triggerCatalog() { return this.legacy.triggerCatalog(); }
  duplicate(id: string): MacroView { return this.legacy.duplicate(id); }
  setEnabled(id: string, enabled: boolean): MacroView { return this.legacy.setEnabled(id, enabled); }
  runManual(id: string): Promise<MacroView | AutomationExecutionResult> { return this.legacy.runManual(id); }
  resumeFailedRun(runId: string, mode: "retry" | "continue"): Promise<MacroRun> { return mode === "retry" ? this.retry(runId) : this.resume(runId); }
  testDraft(input: MacroDraft): Promise<MacroDryRun> { return this.legacy.testDraft(input); }
  listRuns(id: string, limit = 50): MacroRun[] { return this.legacy.listRuns(id, limit); }
  getRun(id: string): MacroRun | undefined { return this.legacy.getRun(id); }
  createFromNatural(input: { name: string; when: string; command: string; enabled?: boolean }): MacroView { return this.legacy.createFromNatural(input); }
}
