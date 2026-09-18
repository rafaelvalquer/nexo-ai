/**
 * @deprecated Persisted automation rows remain compatible, but new domain code
 * should use the Macro vocabulary exported from `macros.ts`.
 */
import type {
  CreateMacroInput,
  Macro,
  MacroCapability,
  MacroCondition,
  MacroConditionLogicalOperator,
  MacroConditionOperator,
  MacroExecutionContext,
  MacroExecutionResult,
  MacroOutput,
  MacroPolicy,
  MacroPreset,
  MacroPresetCategory,
  MacroRun,
  MacroRunStatus,
  MacroStatus,
  MacroStep,
  MacroStepRun,
  MacroTrigger,
  MacroView,
  UpdateMacroInput
} from "./macros.js";
import { DEFAULT_MACRO_OUTPUT, DEFAULT_MACRO_POLICY } from "./macros.js";

/** @deprecated Use MacroRunStatus. */ export type AutomationRunStatus = MacroRunStatus;
/** @deprecated Use MacroStatus. */ export type AutomationStatus = MacroStatus;
/** @deprecated Use MacroConditionOperator. */ export type AutomationConditionOperator = MacroConditionOperator;
/** @deprecated Use MacroConditionLogicalOperator. */ export type AutomationConditionLogicalOperator = MacroConditionLogicalOperator;
/** @deprecated Use MacroTrigger. */ export type AutomationTrigger = MacroTrigger;
/** @deprecated Use MacroCondition. */ export type AutomationCondition = MacroCondition;
/** @deprecated Use MacroStep. */ export type AutomationAction = MacroStep;
/** @deprecated Use MacroOutput. */ export type AutomationOutput = MacroOutput;
/** @deprecated Use MacroPolicy. */ export type AutomationPolicy = MacroPolicy;
/** @deprecated Use Macro. */ export type AutomationV2 = Macro;
/** @deprecated Use MacroExecutionContext. */ export type AutomationExecutionContext = MacroExecutionContext;
/** @deprecated Use MacroStepRun. */ export type AutomationRunStepViewModel = MacroStepRun;
/** @deprecated Use MacroRun. */ export type AutomationRunViewModel = MacroRun;
/** @deprecated Use MacroView. */ export type AutomationViewModel = MacroView;
/** @deprecated Use MacroCapability. */ export type AutomationCapability = MacroCapability;
/** @deprecated Use MacroPresetCategory. */ export type AutomationPresetCategory = MacroPresetCategory;
/** @deprecated Use MacroPreset. */ export type AutomationPreset = MacroPreset;
/** @deprecated Use MacroExecutionResult. */ export type AutomationExecutionResult = MacroExecutionResult;
/** @deprecated Use CreateMacroInput. */ export type CreateAutomationV2Input = CreateMacroInput;
/** @deprecated Use UpdateMacroInput. */ export type UpdateAutomationV2Input = UpdateMacroInput;

/** @deprecated Use DEFAULT_MACRO_POLICY. */ export const DEFAULT_AUTOMATION_POLICY = DEFAULT_MACRO_POLICY;
/** @deprecated Use DEFAULT_MACRO_OUTPUT. */ export const DEFAULT_AUTOMATION_OUTPUT = DEFAULT_MACRO_OUTPUT;
