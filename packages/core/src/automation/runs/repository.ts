import { MacroRunRepository } from "../../macros/macro-run-repository.js";

/** @deprecated Use MacroRunRepository; the SQLite table remains `automation_runs`. */
export class AutomationRunRepository extends MacroRunRepository {}
