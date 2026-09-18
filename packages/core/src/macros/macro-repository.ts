import { randomUUID } from "node:crypto";
import type {
  MacroStep,
  MacroCondition,
  MacroConditionLogicalOperator,
  MacroOutput,
  MacroPolicy,
  MacroRunStatus,
  MacroTrigger,
  Macro,
  CreateMacroInput,
  UpdateMacroInput
} from "@nexo/shared";
import { DEFAULT_MACRO_OUTPUT, DEFAULT_MACRO_POLICY } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { migrateAutomationSchema } from "../automation/migrations.js";

export class MacroRepository {
  constructor(private db: NexoDatabase) { migrateAutomationSchema(this.db); }

  list(): Macro[] {
    return this.db.all<MacroDatabaseRow>("SELECT * FROM automations ORDER BY created_at DESC").map(row => this.map(row));
  }

  get(id: string): Macro | undefined {
    const row = this.db.get<MacroDatabaseRow>("SELECT * FROM automations WHERE id=?", [id]);
    return row ? this.map(row) : undefined;
  }

  create(input: CreateMacroInput): Macro {
    const now = new Date().toISOString();
    const automation: Macro = {
      ...input,
      id: randomUUID(),
      version: 2,
      conditionOperator: input.conditionOperator ?? "AND",
      output: input.output ?? DEFAULT_MACRO_OUTPUT,
      policy: input.policy ?? DEFAULT_MACRO_POLICY,
      createdAt: now,
      updatedAt: now,
      consecutiveFailures: 0
    };
    this.insert(automation);
    return automation;
  }

  update(id: string, patch: UpdateMacroInput): Macro {
    const current = this.require(id);
    const next: Macro = { ...current, ...patch, id, version: 2, updatedAt: new Date().toISOString() };
    this.write(next);
    return next;
  }

  duplicate(id: string): Macro {
    const source = this.require(id);
    return this.create({
      name: `${source.name} — cópia`,
      description: source.description,
      icon: source.icon,
      enabled: false,
      trigger: source.trigger,
      conditions: source.conditions,
      conditionOperator: source.conditionOperator,
      actions: source.actions,
      output: source.output,
      policy: source.policy
      ,prompt: source.prompt
    });
  }

  remove(id: string): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM automation_run_steps WHERE run_id IN (SELECT id FROM automation_runs WHERE automation_id=?)", [id]);
      this.db.run("DELETE FROM automation_runs WHERE automation_id=?", [id]);
      this.db.run("DELETE FROM automation_trigger_state WHERE automation_id=?", [id]);
      this.db.run("DELETE FROM automations WHERE id=?", [id]);
    });
  }

  setEnabled(id: string, enabled: boolean): Macro {
    return this.update(id, { enabled });
  }

  updateRunState(id: string, state: { lastRunAt?: string; lastRunStatus?: MacroRunStatus; consecutiveFailures?: number; nextRunAt?: string }): void {
    const current = this.require(id);
    this.db.run(
      "UPDATE automations SET last_run_at=?,last_run_status=?,consecutive_failures=?,next_run_at=?,updated_at=? WHERE id=?",
      [state.lastRunAt ?? current.lastRunAt ?? null, state.lastRunStatus ?? current.lastRunStatus ?? null, state.consecutiveFailures ?? current.consecutiveFailures, state.nextRunAt ?? current.nextRunAt ?? null, new Date().toISOString(), id]
    );
  }

  getTriggerState(id: string): Record<string, unknown> {
    const row = this.db.get<{ state_json: string }>("SELECT state_json FROM automation_trigger_state WHERE automation_id=?", [id]);
    return row ? safeObject(row.state_json) : {};
  }

  setTriggerState(id: string, state: Record<string, unknown>): void {
    this.db.run(
      "INSERT INTO automation_trigger_state(automation_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(automation_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",
      [id, JSON.stringify(state), new Date().toISOString()]
    );
  }

  private require(id: string): Macro {
    const automation = this.get(id);
    if (!automation) throw new Error("Automação não encontrada.");
    return automation;
  }

  private insert(automation: Macro): void {
    const legacy = legacyColumns(automation);
    this.db.run(
      "INSERT INTO automations(id,name,enabled,trigger_type,schedule,watch_path,command,last_run_at,created_at,version,description,icon,trigger_json,conditions_json,condition_operator,actions_json,output_json,policy_json,prompt,updated_at,next_run_at,last_run_status,consecutive_failures) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [automation.id, automation.name, automation.enabled ? 1 : 0, legacy.triggerType, legacy.schedule, legacy.watchPath, legacy.command, automation.lastRunAt ?? null, automation.createdAt, 2, automation.description ?? null, automation.icon ?? null, JSON.stringify(automation.trigger), JSON.stringify(automation.conditions), automation.conditionOperator, JSON.stringify(automation.actions), JSON.stringify(automation.output), JSON.stringify(automation.policy), automation.prompt ?? null, automation.updatedAt, automation.nextRunAt ?? null, automation.lastRunStatus ?? null, automation.consecutiveFailures]
    );
  }

  private write(automation: Macro): void {
    const legacy = legacyColumns(automation);
    this.db.run(
      "UPDATE automations SET name=?,enabled=?,trigger_type=?,schedule=?,watch_path=?,command=?,version=2,description=?,icon=?,trigger_json=?,conditions_json=?,condition_operator=?,actions_json=?,output_json=?,policy_json=?,prompt=?,updated_at=?,next_run_at=?,last_run_status=?,consecutive_failures=? WHERE id=?",
      [automation.name, automation.enabled ? 1 : 0, legacy.triggerType, legacy.schedule, legacy.watchPath, legacy.command, automation.description ?? null, automation.icon ?? null, JSON.stringify(automation.trigger), JSON.stringify(automation.conditions), automation.conditionOperator, JSON.stringify(automation.actions), JSON.stringify(automation.output), JSON.stringify(automation.policy), automation.prompt ?? null, automation.updatedAt, automation.nextRunAt ?? null, automation.lastRunStatus ?? null, automation.consecutiveFailures, automation.id]
    );
  }

  private map(row: MacroDatabaseRow): Macro {
    const createdAt = row.created_at;
    if (Number(row.version ?? 1) >= 2 && row.trigger_json && row.actions_json) {
      return {
        id: row.id,
        version: 2,
        name: row.name,
        description: row.description ?? undefined,
        icon: row.icon ?? undefined,
        enabled: Boolean(row.enabled),
        trigger: safeJson<MacroTrigger>(row.trigger_json, { type: "manual" }),
        conditions: safeJson<MacroCondition[]>(row.conditions_json, []),
        conditionOperator: (row.condition_operator === "OR" ? "OR" : "AND") as MacroConditionLogicalOperator,
        actions: safeJson<MacroStep[]>(row.actions_json, []),
        output: safeJson<MacroOutput>(row.output_json, DEFAULT_MACRO_OUTPUT),
        prompt: row.prompt ?? undefined,
        policy: safeJson<MacroPolicy>(row.policy_json, DEFAULT_MACRO_POLICY),
        createdAt,
        updatedAt: row.updated_at ?? createdAt,
        nextRunAt: row.next_run_at ?? undefined,
        lastRunAt: row.last_run_at ?? undefined,
        lastRunStatus: asRunStatus(row.last_run_status),
        consecutiveFailures: Number(row.consecutive_failures ?? 0)
      };
    }
    return legacyToMacro(row);
  }
}

type MacroDatabaseRow = {
  id: string; name: string; enabled: number; trigger_type: string; schedule: string | null; watch_path: string | null; command: string; last_run_at: string | null; created_at: string;
  version?: number | null; description?: string | null; icon?: string | null; trigger_json?: string | null; conditions_json?: string | null; condition_operator?: string | null; actions_json?: string | null; output_json?: string | null; policy_json?: string | null;
  updated_at?: string | null; next_run_at?: string | null; last_run_status?: string | null; consecutive_failures?: number | null; prompt?: string | null;
};

function legacyToMacro(row: MacroDatabaseRow): Macro {
  const trigger: MacroTrigger = row.trigger_type === "cron" ? { type: "schedule", mode: "cron", cron: row.schedule ?? undefined }
    : row.trigger_type === "file-created" ? { type: "file.created", path: row.watch_path ?? "" }
    : row.trigger_type === "file-changed" ? { type: "file.changed", path: row.watch_path ?? "" }
    : row.trigger_type === "app-start" ? { type: "app-start" }
    : { type: "manual" };
  const action: MacroStep = { id: "legacy-command", type: "nexo.command", config: { command: row.command } };
  const isUnreadEmailSummary = row.name === "Resumir e-mails não lidos";
  const isEndOfDaySummary = row.name === "Resumo do fim do dia";
  return {
    id: row.id, version: 2, name: row.name, enabled: Boolean(row.enabled), trigger, conditions: [], conditionOperator: "AND", actions: [action],
    output: { type: "chat", conversationMode: "automation" },
    prompt: isUnreadEmailSummary ? "Resuma meus e-mails não lidos e destaque os que exigem ação." : isEndOfDaySummary ? "Faça um resumo objetivo das pendências, agenda e e-mails importantes do dia." : undefined,
    policy: DEFAULT_MACRO_POLICY, createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
    lastRunAt: row.last_run_at ?? undefined, lastRunStatus: asRunStatus(row.last_run_status), consecutiveFailures: Number(row.consecutive_failures ?? 0)
  };
}

function legacyColumns(automation: Macro): { triggerType: string; schedule: string | null; watchPath: string | null; command: string } {
  const triggerType = automation.trigger.type === "schedule" ? "cron" : automation.trigger.type === "file.created" ? "file-created" : automation.trigger.type === "file.changed" ? "file-changed" : automation.trigger.type === "app-start" ? "app-start" : "manual";
  const schedule = automation.trigger.type === "schedule" ? automation.trigger.cron ?? null : null;
  const watchPath = automation.trigger.type === "file.created" || automation.trigger.type === "file.changed" || automation.trigger.type === "file.deleted" ? automation.trigger.path : null;
  const commandAction = automation.actions.find(action => action.type === "nexo.command");
  return { triggerType, schedule, watchPath, command: typeof commandAction?.config.command === "string" ? commandAction.config.command : "" };
}

function safeJson<T>(value: string | null | undefined, fallback: T): T { if (!value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
function safeObject(value: string): Record<string, unknown> { return safeJson<Record<string, unknown>>(value, {}); }
function asRunStatus(value: string | null | undefined): MacroRunStatus | undefined {
  return value === "queued" || value === "running" || value === "waiting_approval" || value === "success" || value === "failed" || value === "skipped" || value === "cancelled" ? value : undefined;
}
