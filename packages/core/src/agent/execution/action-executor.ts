import { randomUUID,createHash } from "node:crypto";
import fs from "node:fs/promises";
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
import type { ConnectionService } from "../../connections/service.js";
import type { ConnectionCapability } from "@nexo/shared";
import {actionFingerprint,canonicalJson,createIdempotencyKey} from "./action-fingerprint.js";
import {ConnectionResolver,isConnectionCapability} from "./connection-resolver.js";
import {semanticMutationAllowed} from "../security/semantic-mutation-guard.js";
export {actionFingerprint,canonicalJson} from "./action-fingerprint.js";

/** The sole safe execution entry point for agent, UI, and automation actions. */
export class ActionExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionEngine,
    private readonly audit: AuditService,
    private readonly options: { security?: SecurityPolicyService; metrics?: LocalMetricsService; resources?: ResourceManager; records?: ExecutionRecordRepository;connections?:ConnectionService } = {}
  ) {}

  async preflight(toolName: string, rawInput: Record<string, unknown>, context: ActionExecutionContext = {}): Promise<ActionPreflightResult> {
    const tool = this.registry.get(toolName);
    if (!tool) {this.options.metrics?.record("agent.tool_call_invalid",1,{tool:toolName});return fail("TOOL_NOT_FOUND", `Ferramenta não disponível: ${toolName}`);}
    try { this.options.security?.assertToolEnabled(tool.name); } catch (error) { return fail("SECURITY_DENIED", message(error)); }
    const mutatesState = tool.mutatesState ?? tool.risk !== "READ";
    if(mutatesState&&!semanticMutationAllowed(context.userRequest))return fail("SECURITY_DENIED","A solicitação é semanticamente de leitura e não autoriza alteração de estado.");
    const candidate={...rawInput};
    for (const capability of tool.permissions) {
      if(isConnectionCapability(capability)&&this.options.connections){const resolution=new ConnectionResolver(this.options.connections).resolve(capability,candidate.connectionId);if(!resolution.ok)return fail("CAPABILITY_DENIED",resolution.reason!);if(resolution.connectionId&&!candidate.connectionId)candidate.connectionId=resolution.connectionId;}
      if(isConnectionCapability(capability)&&!this.options.connections&&!context.capabilityResolver)return fail("CAPABILITY_DENIED",`Nenhum resolvedor de conexão configurado para ${capability}.`);
      if (context.capabilityResolver && !await context.capabilityResolver(capability)) return fail("CAPABILITY_DENIED", `Capacidade não autorizada: ${capability}`);
    }
    const parsed = tool.inputSchema.safeParse(candidate);
    if (!parsed.success) {this.options.metrics?.record("agent.schema_error",1,{tool:tool.name});return fail("SCHEMA_INVALID", `Parâmetros inválidos para ${tool.name}: ${parsed.error.issues.map(issue => issue.message).join(", ")}`);}
    const input = parsed.data as Record<string, unknown>;
    try {
      this.options.security?.assertRecipientDomains(input.to as Array<{ email?: string }> | undefined);
      for (const field of tool.pathFields ?? []) validatePaths(input[field], target => this.permissions.assertPath(target));
    } catch (error) { return fail("PATH_DENIED", message(error)); }
    await enrichReconciliationEvidence(tool.name,input);
    const executionId = context.executionId ?? randomUUID();
    const fingerprint = actionFingerprint(tool.name, input);
    const action: PreparedAction = {
      executionId, toolName: tool.name, input, fingerprint, mutatesState, risk: tool.risk,
      idempotencyKey: mutatesState && (tool.supportsIdempotency||tool.mutationSafety?.idempotency==="provider"||tool.mutationSafety?.idempotency==="nexo") ? createIdempotencyKey(context.runId, executionId, fingerprint) : undefined,
      requiresApproval: mutatesState || this.permissions.requiresApproval(tool.risk, mutatesState) || Boolean(this.options.security?.requiresApproval(tool.name, tool.risk)),
      status: "PREPARED"
    };
    if (mutatesState) this.options.records?.prepare(action, context.runId);
    return { ok: true, action };
  }

  async executePrepared(action: PreparedAction, context: ActionExecutionContext = {}): Promise<ActionExecutionResult> {
    if (action.status !== "PREPARED") throw new Error(`Ação ${action.executionId} não está pronta para despacho.`);
    const tool = this.registry.get(action.toolName);
    if (!tool) return { status: "FAILED", action, error: "Ferramenta não encontrada durante o despacho." };
    if (action.requiresApproval && action.mutatesState && !context.dispatchAuthorized) return { status: "FAILED", action, error: "Mutation bloqueada: aprovação exata não foi validada e consumida." };
    const startedAt = Date.now();
    if(action.mutatesState){const prior=this.options.records?.get(action.executionId);if(prior?.status==="SUCCEEDED"||prior?.status==="RECONCILED_SUCCESS")return{status:"SUCCEEDED",action,result:prior.result};if(prior?.status==="DISPATCHING"||prior?.status==="RESULT_UNKNOWN"||prior?.status==="UNRESOLVED")return{status:"RESULT_UNKNOWN",action,error:prior.error??"A mutation já foi despachada e precisa de reconciliação."};if(prior?.status==="FAILED"||prior?.status==="RECONCILED_FAILURE")return{status:"FAILED",action,result:prior.result,error:prior.error};}
    // Audit dispatch before a mutation: a crash/timeout after this point is ambiguous, never retry it automatically.
    if (action.mutatesState) { this.options.records?.prepare(action, context.runId); this.options.records?.markDispatching(action.executionId); this.audit.record(tool.name, tool.risk, "DISPATCHING", { executionId: action.executionId, fingerprint: action.fingerprint }); }
    try {
      if (context.signal?.aborted) throw context.signal.reason ?? new DOMException("Cancelada", "AbortError");
      const result = await this.withResources(tool, action.input, context, () => tool.execute(action.input, { ...context, executionId: action.executionId, idempotencyKey: action.idempotencyKey }));
      const status = result.ok ? "SUCCEEDED" : "FAILED" as const;
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: result.ok });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, result });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { result });
      this.options.metrics?.record(result.ok?"agent.tool_succeeded":"agent.tool_failed",1,{tool:tool.name});
      return { status, action, result };
    } catch (error) {
      const ambiguous = action.mutatesState && isAmbiguous(error);
      const status = ambiguous ? "RESULT_UNKNOWN" : "FAILED" as const;
      const errorMessage = message(error);
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: false });
      this.options.metrics?.record("tool.failed", 1, { tool: tool.name });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, error: errorMessage });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { error: errorMessage });
      this.options.metrics?.record(ambiguous?"agent.result_unknown":"agent.tool_failed",1,{tool:tool.name});
      return { status, action, error: errorMessage };
    }
  }

  /** @deprecated Prefer executePrepared; retained for API compatibility. */
  execute(action:PreparedAction,context:ActionExecutionContext={}){return this.executePrepared(action,context);}

  private withResources<T>(tool: ToolDefinition, input: Record<string, unknown>, context: ActionExecutionContext, work: () => Promise<T>) {
    const keys: string[] = [];
    if (tool.name.startsWith("browser_")) keys.push(`browser:${context.runId ?? "default"}`);
    if (/^(app_|shell_|desktop_)/.test(tool.name)) keys.push("desktop-input");
    if (tool.mutatesState ?? tool.risk !== "READ") for (const field of tool.pathFields ?? []) validatePaths(input[field], target => keys.push(`filesystem:${path.resolve(target).toLowerCase()}`));
    return this.options.resources ? this.options.resources.withResources(keys, work) : work();
  }
}

function validatePaths(value: unknown, use: (path: string) => void) { if (typeof value === "string") use(value); else if (Array.isArray(value)) value.forEach(item => { if (typeof item === "string") use(item); }); }
function fail(code: Extract<ActionPreflightResult, { ok: false }> ["code"], message: string): ActionPreflightResult { return { ok: false, code, message }; }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function isAmbiguous(error: unknown) { return error instanceof DOMException && error.name === "AbortError" || /timeout|timed? out|network|connection reset|socket/i.test(message(error)); }
async function enrichReconciliationEvidence(toolName:string,input:Record<string,unknown>){if(!["copy_file","move_file","rename_file"].includes(toolName))return;const source=typeof input.source==="string"?input.source:typeof input.path==="string"?input.path:undefined;if(!source)return;try{input.__nexoSourceHash=createHash("sha256").update(await fs.readFile(source)).digest("hex");}catch{/* Directories and unreadable inputs use existence evidence only. */}}
