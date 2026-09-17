import type {
  AutomationAction,
  AutomationExecutionResult,
  AutomationRunViewModel,
  AutomationV2,
  AutomationViewModel,
  CreateAutomationV2Input,
  UpdateAutomationV2Input
} from "@nexo/shared";

export type Macro = AutomationV2;
export type MacroStep = AutomationAction;
export type MacroRun = AutomationRunViewModel;
export type CreateMacroInput = CreateAutomationV2Input;
export type UpdateMacroInput = UpdateAutomationV2Input;
export type MacroDraft = CreateMacroInput;
export type MacroDryRun = MacroRun | AutomationExecutionResult | undefined;
export type MacroView = AutomationViewModel;
