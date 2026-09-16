import type { ConnectionService } from "../../connections/service.js";
import fs from "node:fs";
import path from "node:path";
import type { PermissionEngine } from "../../permissions/policy.js";
import type { SecurityPolicyService } from "../../security/policy.js";
import type { ToolRegistry } from "../../tools/registry.js";
import { semanticMutationAllowed } from "../security/semantic-mutation-guard.js";
import { actionFingerprint } from "./action-fingerprint.js";
import { ConnectionResolver, isConnectionCapability } from "./connection-resolver.js";
import type { ActionExecutionContext, ActionPreflightResult } from "./types.js";

export type ActionValidationResult =
  | { ok: true; toolName: string; input: Record<string, unknown>; fingerprint: string; mutatesState: boolean }
  | Extract<ActionPreflightResult, { ok: false }>;

export type CurrentActionValidationContext = ActionExecutionContext & { expectedFingerprint?: string };

export class ActionValidator {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionEngine,
    private readonly security?: SecurityPolicyService,
    private readonly connections?: ConnectionService
  ) {}

  async validateCurrent(toolName: string, rawInput: Record<string, unknown>, context: CurrentActionValidationContext = {}): Promise<ActionValidationResult> {
    const tool = this.registry.get(toolName);
    if (!tool) return failure("TOOL_NOT_FOUND", `Ferramenta não disponível: ${toolName}`);
    try { this.security?.assertToolEnabled(tool.name); }
    catch (error) { return failure("TOOL_DISABLED", message(error)); }

    const mutatesState = tool.mutatesState ?? tool.risk !== "READ";
    if (mutatesState && !semanticMutationAllowed(context.userRequest)) return failure("SECURITY_DENIED", "A solicitação é semanticamente de leitura e não autoriza alteração de estado.");

    const evidence = Object.fromEntries(Object.entries(rawInput).filter(([key]) => key.startsWith("__nexo")));
    const candidate = Object.fromEntries(Object.entries(rawInput).filter(([key]) => !key.startsWith("__nexo")));
    for (const capability of tool.permissions) {
      if (isConnectionCapability(capability) && this.connections) {
        const resolution = new ConnectionResolver(this.connections).resolve(capability, candidate.connectionId);
        if (!resolution.ok) return failure("CAPABILITY_DENIED", resolution.reason!);
        if (resolution.connectionId && !candidate.connectionId) candidate.connectionId = resolution.connectionId;
      }
      if (isConnectionCapability(capability) && !this.connections && !context.capabilityResolver) return failure("CAPABILITY_DENIED", `Nenhum resolvedor de conexão configurado para ${capability}.`);
      if (context.capabilityResolver && !await context.capabilityResolver(capability)) return failure("CAPABILITY_DENIED", `Capacidade não autorizada: ${capability}`);
    }

    const parsed = tool.inputSchema.safeParse(candidate);
    if (!parsed.success) return failure("SCHEMA_INVALID", `Parâmetros inválidos para ${tool.name}: ${parsed.error.issues.map(issue => issue.message).join(", ")}`);
    const input = { ...(parsed.data as Record<string, unknown>), ...evidence };
    try {
      this.security?.assertRecipientDomains(input.to as Array<{ email?: string }> | undefined);
      for (const field of tool.pathFields ?? []) validatePaths(input[field], value => validatePhysicalPath(value, this.permissions));
      validateFilesystemSemantics(tool.name,input);
    } catch (error) {
      return failure("PATH_DENIED", message(error));
    }
    const fingerprint = actionFingerprint(tool.name, input);
    if (context.expectedFingerprint && fingerprint !== context.expectedFingerprint) return failure("ACTION_STALE", "A ação mudou desde a aprovação; o despacho foi bloqueado.");
    return { ok: true, toolName: tool.name, input, fingerprint, mutatesState };
  }
}

function validatePaths(value: unknown, use: (target: string) => void) {
  if (typeof value === "string") use(value);
  else if (Array.isArray(value)) for (const item of value) if (typeof item === "string") use(item);
}
function validatePhysicalPath(target:string,permissions:PermissionEngine){
  const absolute=path.resolve(target);
  if(fs.existsSync(absolute)){permissions.assertPath(fs.realpathSync.native(absolute));return;}
  const physicalParent=fs.realpathSync.native(path.dirname(absolute));
  permissions.assertPath(physicalParent);
  permissions.assertPath(path.join(physicalParent,path.basename(absolute)));
}
function failure(code: Extract<ActionPreflightResult, { ok: false }>["code"], text: string): Extract<ActionPreflightResult, { ok: false }> { return { ok: false, code, message: text }; }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function validateFilesystemSemantics(toolName:string,input:Record<string,unknown>){const target=typeof input.path==="string"?input.path:typeof input.outputPath==="string"?input.outputPath:undefined;if(!target)return;if(["create_text_file","document_create","document_transform"].includes(toolName)&&fs.existsSync(target))throw new Error("FILE_ALREADY_EXISTS");if(toolName==="write_text_file"&&!fs.existsSync(target))throw new Error("FILE_NOT_FOUND");}
