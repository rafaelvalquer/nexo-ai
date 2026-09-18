import type { CreateMacroInput, Macro, MacroExecutionResult, MacroRun, MacroStep, MacroView, UpdateMacroInput } from "@nexo/shared";
export type { CreateMacroInput, Macro, MacroRun, MacroStep, MacroView, UpdateMacroInput } from "@nexo/shared";

export type MacroDraft = CreateMacroInput;
export type MacroDryRun = MacroRun | MacroExecutionResult | undefined;
