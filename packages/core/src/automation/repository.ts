import { MacroRepository } from "../macros/macro-repository.js";

/** @deprecated Use MacroRepository; the SQLite table remains `automations` for compatibility. */
export class AutomationRepository extends MacroRepository {}
