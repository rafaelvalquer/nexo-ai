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
import type { LocationRegistry } from "../../locations/location-registry.js";
import type { ActionExecutionContext, ActionExecutionResult, ActionPreflightResult, PreparedAction } from "./types.js";
import type { ExecutionRecordRepository } from "./execution-record-repository.js";
import type { ConnectionService } from "../../connections/service.js";
import type { ConnectionCapability } from "@nexo/shared";
import {actionFingerprint,canonicalJson,createIdempotencyKey} from "./action-fingerprint.js";
import { ActionValidator } from "./action-validator.js";
import { documentOutputBuffer, type DocumentFormat } from "../../documents/writer.js";
export {actionFingerprint,canonicalJson} from "./action-fingerprint.js";

/** The sole safe execution entry point for agent, UI, and automation actions. */
export class ActionExecutor {
  private readonly validator: ActionValidator;
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionEngine,
    private readonly audit: AuditService,
    private readonly options: { security?: SecurityPolicyService; metrics?: LocalMetricsService; resources?: ResourceManager; records?: ExecutionRecordRepository;connections?:ConnectionService;locations?:LocationRegistry } = {}
  ) { this.validator = new ActionValidator(registry, permissions, options.security, options.connections, options.locations); }

  /** The same roots used by PermissionEngine/PathPolicy. Agent intent resolution must never maintain a second authority list. */
  allowedFilesystemRoots() {
    return this.permissions.allowedRoots();
  }

  async preflight(toolName: string, rawInput: Record<string, unknown>, context: ActionExecutionContext = {}): Promise<ActionPreflightResult> {
    const validation = await this.validator.validateCurrent(toolName, rawInput, context);
    if (!validation.ok) {
      this.options.metrics?.record(validation.code === "SCHEMA_INVALID" ? "agent.schema_error" : "agent.tool_call_invalid", 1, { tool: toolName, code: validation.code });
      return validation;
    }
    const tool = this.registry.get(validation.toolName)!;
    const { mutatesState } = validation;
    const input = validation.input;
    await enrichReconciliationEvidence(tool.name,input);
    const executionId = context.executionId ?? randomUUID();
    const fingerprint = actionFingerprint(tool.name, input);
    const action: PreparedAction = {
      executionId, toolName: tool.name, input, fingerprint, mutatesState, risk: tool.risk,
      idempotencyKey: mutatesState && (tool.supportsIdempotency||tool.mutationSafety?.idempotency==="provider"||tool.mutationSafety?.idempotency==="nexo") ? createIdempotencyKey(context.runId, executionId, fingerprint) : undefined,
      requiresApproval: this.permissions.requiresApproval(tool.risk, mutatesState) || Boolean(this.options.security?.requiresApproval(tool.name, tool.risk)),
      status: "PREPARED"
    };
    if (mutatesState) this.options.records?.prepare(action, context.runId);
    return { ok: true, action };
  }

  async executePrepared(action: PreparedAction, context: ActionExecutionContext = {}): Promise<ActionExecutionResult> {
    if (action.status !== "PREPARED") throw new Error(`Ação ${action.executionId} não está pronta para despacho.`);
    if (action.requiresApproval && action.mutatesState && !context.dispatchAuthorized) return { status: "FAILED", action, error: "Mutation bloqueada: aprovação exata não foi validada e consumida." };
    const current = await this.revalidatePreparedAction(action, context);
    if (!current.ok) return { status: "FAILED", action, error: `${current.code}: ${current.message}` };
    const tool = this.registry.get(action.toolName)!;
    const startedAt = Date.now();
    if(action.mutatesState){const prior=this.options.records?.get(action.executionId);if(prior?.status==="SUCCEEDED"||prior?.status==="RECONCILED_SUCCESS")return{status:"SUCCEEDED",action,result:prior.result};if(prior?.status==="DISPATCHING"||prior?.status==="RESULT_UNKNOWN"||prior?.status==="UNRESOLVED")return{status:"RESULT_UNKNOWN",action,error:prior.error??"A mutation já foi despachada e precisa de reconciliação."};if(prior?.status==="FAILED"||prior?.status==="RECONCILED_FAILURE")return{status:"FAILED",action,result:prior.result,error:prior.error};}
    // Audit dispatch before a mutation: a crash/timeout after this point is ambiguous, never retry it automatically.
    if (action.mutatesState) { this.options.records?.prepare(action, context.runId); this.options.records?.markDispatching(action.executionId); this.audit.record(tool.name, tool.risk, "DISPATCHING", { executionId: action.executionId, fingerprint: action.fingerprint }); }
    try {
      if (context.signal?.aborted) throw context.signal.reason ?? new DOMException("Cancelada", "AbortError");
      const rawResult = await this.withResources(tool, action.input, context, () => this.withToolTimeout(tool,context.signal,signal=>tool.execute(action.input, { ...context, filesystemRoots:this.permissions.allowedRoots(), assertFilesystemPath:(target:string)=>this.permissions.assertPath(target), signal, executionId: action.executionId, idempotencyKey: action.idempotencyKey })));
      const result = normalizeToolResult(rawResult);
      const status = result.ok ? "SUCCEEDED" : "FAILED" as const;
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: result.ok });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, durationMs: Date.now() - startedAt, errorCode: result.ok ? undefined : "TOOL_RESULT_ERROR", result });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { result });
      this.options.metrics?.record(result.ok?"agent.tool_succeeded":"agent.tool_failed",1,{tool:tool.name});
      return { status, action, result };
    } catch (error) {
      const ambiguous = action.mutatesState && isAmbiguous(error);
      const status = ambiguous ? "RESULT_UNKNOWN" : "FAILED" as const;
      const errorMessage = message(error);
      this.options.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool: tool.name, ok: false });
      this.options.metrics?.record("tool.failed", 1, { tool: tool.name });
      this.audit.record(tool.name, tool.risk, status, { executionId: action.executionId, input: action.input, durationMs: Date.now() - startedAt, errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR", error: errorMessage });
      if (action.mutatesState) this.options.records?.complete(action.executionId, status, { error: errorMessage });
      this.options.metrics?.record(ambiguous?"agent.result_unknown":"agent.tool_failed",1,{tool:tool.name});
      return { status, action, error: errorMessage };
    }
  }

  /** @deprecated Prefer executePrepared; retained for API compatibility. */
  execute(action:PreparedAction,context:ActionExecutionContext={}){return this.executePrepared(action,context);}

  revalidatePreparedAction(action: PreparedAction, context: ActionExecutionContext = {}) {
    return this.validator.validateCurrent(action.toolName, action.input, { ...context, expectedFingerprint: action.fingerprint });
  }

  private withResources<T>(tool: ToolDefinition, input: Record<string, unknown>, context: ActionExecutionContext, work: () => Promise<T>) {
    const keys: string[] = [];
    if (tool.name.startsWith("browser_")) keys.push(`browser:${context.runId ?? "default"}`);
    if (/^(app_|shell_|desktop_)/.test(tool.name)) keys.push("desktop-input");
    if (tool.mutatesState ?? tool.risk !== "READ") for (const field of tool.pathFields ?? []) validatePaths(input[field], target => keys.push(`filesystem:${path.resolve(target).toLowerCase()}`));
    return this.options.resources ? this.options.resources.withResources(keys, work) : work();
  }

  private async withToolTimeout<T>(tool:ToolDefinition,parent:AbortSignal|undefined,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    const timeoutMs=tool.timeoutMs??defaultToolTimeout(tool);
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>300_000)throw new Error(`Timeout inválido configurado para a ferramenta ${tool.name}.`);
    if(parent?.aborted)throw parent.reason??new DOMException("Cancelada","AbortError");
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const onParentAbort=()=>controller.abort(parent?.reason??new DOMException("Cancelada","AbortError"));
    const abortPromise=new Promise<never>((_,reject)=>controller.signal.addEventListener("abort",()=>reject(controller.signal.reason??new DOMException("Cancelada","AbortError")),{once:true}));
    parent?.addEventListener("abort",onParentAbort,{once:true});
    timer=setTimeout(()=>controller.abort(new DOMException(`A ferramenta excedeu o limite de ${timeoutMs} ms.`,"TimeoutError")),timeoutMs);timer.unref?.();
    try{return await Promise.race([work(controller.signal),abortPromise]);}
    finally{if(timer)clearTimeout(timer);parent?.removeEventListener("abort",onParentAbort);}
  }
}

function validatePaths(value: unknown, use: (path: string) => void) { if (typeof value === "string") use(value); else if (Array.isArray(value)) value.forEach(item => { if (typeof item === "string") use(item); }); }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function normalizeToolResult(result: import("@nexo/shared").ToolResultInput): import("@nexo/shared").ToolResult {
  if ("success" in result) return result;
  const legacyError = typeof result.error === "string" ? result.error : undefined;
  const code = legacyError && /^[A-Z][A-Z0-9_]{2,}$/.test(legacyError) ? legacyError : "TOOL_EXECUTION_FAILED";
  return { success: result.ok, ok: result.ok, summary: result.summary, ...(result.data === undefined ? {} : { data: result.data }), ...(!result.ok ? { error: { code, message: legacyError ?? result.summary } } : {}) };
}
function isAmbiguous(error: unknown) { return error instanceof DOMException && error.name === "AbortError" || /timeout|timed? out|network|connection reset|socket/i.test(message(error)); }
function defaultToolTimeout(tool:ToolDefinition){if(tool.domain==="web"||tool.name.startsWith("web_"))return 15_000;if(tool.domain==="browser"||tool.name.startsWith("browser_"))return 30_000;if(tool.domain==="document"||tool.name.startsWith("document_"))return 120_000;return 60_000;}
async function enrichReconciliationEvidence(toolName:string,input:Record<string,unknown>){
  if(["create_text_file","write_text_file"].includes(toolName)&&typeof input.content==="string")input.__nexoOutputHash=createHash("sha256").update(Buffer.from(input.content,"utf8")).digest("hex");
  if(toolName==="document_create"&&typeof input.content==="string"&&["txt","md","docx"].includes(String(input.format)))input.__nexoOutputHash=createHash("sha256").update(documentOutputBuffer(input.format as DocumentFormat,input.content,typeof input.title==="string"?input.title:undefined)).digest("hex");
  if(!["copy_file","move_file","rename_file"].includes(toolName))return;const source=typeof input.source==="string"?input.source:typeof input.path==="string"?input.path:undefined;if(!source)return;try{input.__nexoSourceHash=createHash("sha256").update(await fs.readFile(source)).digest("hex");}catch{/* Directories and unreadable inputs use existence evidence only. */}}
