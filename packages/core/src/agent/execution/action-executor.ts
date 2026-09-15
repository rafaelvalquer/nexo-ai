import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { ToolRegistry } from "../../tools/registry.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { PermissionEngine } from "../../permissions/policy.js";
import type { SecurityPolicyService } from "../../security/policy.js";
import type { AuditService } from "../../audit/audit.js";
import type { LocalMetricsService } from "../../observability/metrics.js";
import type { ResourceManager } from "../../runtime/resource-manager.js";
import type { ActionExecutionContext, ActionExecutionResult, ActionPreflightResult, PreparedAction } from "./types.js";
import type { ExecutionRecordRepository } from "./execution-record-repository.js";

/** The sole safe execution entry point for agent, UI, and automation actions. */
export class ActionExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionEngine,
    private readonly audit: AuditService,
    private readonly options: { security?: SecurityPolicyService; metrics?: LocalMetricsService; resources?: ResourceManager; records?: ExecutionRecordRepository } = {}
  ) {}

  async preflight(toolName: string, rawInput: Record<string, unknown>, context: ActionExecutionContext = {}): Promise<ActionPreflightResult> {
    const tool = this.registry.get(toolName);
    if (!tool) return fail("TOOL_NOT_FOUND", `Ferramenta não disponível: ${toolName}`);
    try { this.options.security?.assertToolEnabled(tool.name); } catch (error) { return fail("SECURITY_DENIED", message(error)); }
    for (const capability of tool.permissions) {
      if (!context.capabilityResolver || await context.capabilityResolver(capability)) continue;
      return fail("CAPABILITY_DENIED", `Capacidade não autorizada: ${capability}`);
    }
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) return fail("SCHEMA_INVALID", `Parâmetros inválidos para ${tool.name}: ${parsed.error.issues.map(issue => issue.message).join(", ")}`);
    const input = parsed.data as Record<string, unknown>;
    try {
      this.options.security?.assertRecipientDomains(input.to as Array<{ email?: string }> | undefined);
      for (const field of tool.pathFields ?? []) validatePaths(input[field], target => this.permissions.assertPath(target));
    } catch (error) { return fail("PATH_DENIED", message(error)); }
    const mutatesState = tool.mutatesState ?? tool.risk !== "READ";
    const executionId = context.executionId ?? randomUUID();
    const fingerprint = actionFingerprint(tool.name, input);
    const action: PreparedAction = {
      executionId, toolName: tool.name, input, fingerprint, mutatesState, risk: tool.risk,
      idempotencyKey: mutatesState && tool.supportsIdempotency ? idempotencyKey(context.runId, executionId, fingerprint) : undefined,
      requiresApproval: mutatesState || this.permissions.requiresApproval(tool.risk, mutatesState) || Boolean(this.options.security?.requiresApproval(tool.name, tool.risk)),
      status: "PREPARED"
    };
    if (mutatesState) this.options.records?.prepare(action, context.runId);
    return { ok: true, action };
  }

  async execute(action: PreparedAction, context: ActionExecutionContext = {}): Promise<ActionExecutionResult> {
    if (action.status !== "PREPARED") throw new Error(`Ação ${action.executionId} não está pronta para despacho.`);
    const tool = this.registry.get(action.toolName);
    if (!tool) return { status: "FAILED", action, error: "Ferramenta não encontrada durante o despacho." };
    const startedAt = Date.now();
    // Audit dispatch before a mutation: a crash/timeout after this point is ambiguous, never retry it automatically.
    if (action.mutatesState) { this.options.records?.prepare(action, context.runId); this.options.records?.markDispatching(action.executionId); this.audit.record(tool.name, tool.risk, "DISPATCHING", { executionId: action.executionId, fingerprint: action.fingerprint }); }
    try {
      if (context.signal?.aborted) throw context.signal.reason ?? new DOMException("Cancelada", "AbortError");
      const result = await this.withResources(tool, action.input, context, () => tool.execute(action.input, { ...context, executionId: action.executionId, idempotencyKey: action.idempotencyKey }));
      const status = result.ok ? "SUCCEEDED" : "FAILED" as const;
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: result.ok });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, result });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { result });
      return { status, action, result };
    } catch (error) {
      const ambiguous = action.mutatesState && isAmbiguous(error);
      const status = ambiguous ? "RESULT_UNKNOWN" : "FAILED" as const;
      const errorMessage = message(error);
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: false });
      this.options.metrics?.record("tool.failed", 1, { tool: tool.name });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, error: errorMessage });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { error: errorMessage });
      return { status, action, error: errorMessage };
    }
  }

  private withResources<T>(tool: ToolDefinition, input: Record<string, unknown>, context: ActionExecutionContext, work: () => Promise<T>) {
    const keys: string[] = [];
    if (tool.name.startsWith("browser_")) keys.push(`browser:${context.runId ?? "default"}`);
    if (/^(app_|shell_|desktop_)/.test(tool.name)) keys.push("desktop-input");
    if (tool.mutatesState ?? tool.risk !== "READ") for (const field of tool.pathFields ?? []) validatePaths(input[field], target => keys.push(`filesystem:${path.resolve(target).toLowerCase()}`));
    return this.options.resources ? this.options.resources.withResources(keys, work) : work();
  }
}

export function actionFingerprint(toolName: string, input: Record<string, unknown>) { return createHash("sha256").update(`${toolName}:${canonicalJson(input)}`).digest("hex"); }
export function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`; return JSON.stringify(value); }
function idempotencyKey(runId: string | undefined, executionId: string, fingerprint: string) { return createHash("sha256").update(`${runId ?? "standalone"}:${executionId}:${fingerprint}`).digest("hex"); }
function validatePaths(value: unknown, use: (path: string) => void) { if (typeof value === "string") use(value); else if (Array.isArray(value)) value.forEach(item => { if (typeof item === "string") use(item); }); }
function fail(code: Extract<ActionPreflightResult, { ok: false }> ["code"], message: string): ActionPreflightResult { return { ok: false, code, message }; }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function isAmbiguous(error: unknown) { return error instanceof DOMException && error.name === "AbortError" || /timeout|timed? out|network|connection reset|socket/i.test(message(error)); }
