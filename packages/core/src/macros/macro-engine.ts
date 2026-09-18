import type { Automation, AutomationExecutionResult } from "@nexo/shared";
import { MacroRuntime } from "./macro-runtime.js";
import type { CreateMacroInput, MacroDraft, MacroDryRun, MacroRun, MacroView, UpdateMacroInput } from "./types.js";
import type { NexoDatabase } from "../database/db.js";

export type MacroEngineOptions={
  db:NexoDatabase;
  executeCommand:(command:string,signal?:AbortSignal)=>Promise<unknown>;
  startMacroChat?:(input:{title:string;prompt:string;automationRunId:string})=>Promise<{conversationId:string;taskId:string}>;
  executeRead?:(name:string,input:Record<string,unknown>)=>Promise<import("@nexo/shared").ToolResult>;
  notify?:(title:string,body:string)=>void;
};

/** Public macro API. The adapter keeps the existing persisted automation format compatible. */
export class MacroEngine {
  private readonly runtime:MacroRuntime;
  constructor(runtimeOrOptions:MacroRuntime|MacroEngineOptions){
    this.runtime=runtimeOrOptions instanceof MacroRuntime?runtimeOrOptions:new MacroRuntime(runtimeOrOptions.db,runtimeOrOptions.executeCommand,runtimeOrOptions.startMacroChat,runtimeOrOptions.executeRead,runtimeOrOptions.notify);
  }

  list(): MacroView[] { return this.runtime.list(); }
  get(id: string): MacroView | undefined { return this.runtime.get(id); }
  create(input: CreateMacroInput | Omit<Automation, "id" | "lastRunAt">): MacroView { return this.runtime.create(input); }
  update(id: string, input: UpdateMacroInput): MacroView { return this.runtime.update(id, input); }
  remove(id: string): void { this.runtime.remove(id); }
  async run(id: string): Promise<MacroRun> {
    const result = await this.runtime.runManual(id);
    if (result && "runId" in result) {
      const run = this.runtime.getRun(result.runId);
      if (run) return run;
    }
    const latest = this.runtime.listRuns(id, 1)[0];
    if (!latest) throw new Error("A macro não iniciou uma execução.");
    return this.runtime.getRun(latest.id) ?? latest;
  }
  cancel(runOrMacroId: string): boolean { return this.runtime.cancel(this.runtime.getRun(runOrMacroId)?.automationId ?? runOrMacroId); }
  retry(runId: string, stepId?: string): Promise<MacroRun> {
    if (stepId) {
      const run = this.runtime.getRun(runId);
      if (!run?.steps?.some(step => step.id === stepId && step.status === "failed")) throw new Error("A etapa informada não corresponde à falha desta execução.");
    }
    return this.runtime.resumeFailedRun(runId, "retry");
  }
  resume(runId: string): Promise<MacroRun> { return this.runtime.resumeFailedRun(runId, "continue"); }
  test(input: string | MacroDraft): Promise<MacroDryRun> { return typeof input === "string" ? this.runtime.test(input) : this.runtime.testDraft(input); }

  /** Temporary API aliases used by existing IPC handlers while renderer contracts migrate. */
  start(): void { this.runtime.start(); }
  stop(): void { this.runtime.stop(); }
  presets() { return this.runtime.presets(); }
  actionCatalog() { return this.runtime.actionCatalog(); }
  triggerCatalog() { return this.runtime.triggerCatalog(); }
  duplicate(id: string): MacroView { return this.runtime.duplicate(id); }
  setEnabled(id: string, enabled: boolean): MacroView { return this.runtime.setEnabled(id, enabled); }
  runManual(id: string): Promise<MacroView | AutomationExecutionResult> { return this.runtime.runManual(id); }
  resumeFailedRun(runId: string, mode: "retry" | "continue"): Promise<MacroRun> { return mode === "retry" ? this.retry(runId) : this.resume(runId); }
  testDraft(input: MacroDraft): Promise<MacroDryRun> { return this.runtime.testDraft(input); }
  listRuns(id: string, limit = 50): MacroRun[] { return this.runtime.listRuns(id, limit); }
  getRun(id: string): MacroRun | undefined { return this.runtime.getRun(id); }
  createFromNatural(input: { name: string; when: string; command: string; enabled?: boolean }): MacroView { return this.runtime.createFromNatural(input); }
}

