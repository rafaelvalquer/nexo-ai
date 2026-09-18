import { MacroStepExecutor } from "../../macros/macro-step-executor.js";
export type { MacroActionExecution as AutomationActionExecution } from "../../macros/macro-step-executor.js";
/** @deprecated Use MacroStepExecutor. */
export class AutomationActionExecutor extends MacroStepExecutor {}
/** @deprecated Use resolveMacroConfig. */
export { resolveMacroConfig as resolveConfig } from "../../macros/macro-step-executor.js";