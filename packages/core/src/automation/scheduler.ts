import { MacroScheduler } from "../macros/macro-scheduler.js";
/** @deprecated Use MacroScheduler. */
export class AutomationScheduler extends MacroScheduler {}
export { scheduleToCron } from "../macros/macro-scheduler.js";
export type { MacroTriggerPayload as AutomationTriggerPayload, MacroTriggerEmitter as AutomationTriggerEmitter } from "../macros/macro-scheduler.js";
