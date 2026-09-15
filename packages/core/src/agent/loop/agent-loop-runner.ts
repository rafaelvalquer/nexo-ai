import type { LLMProvider } from "../../llm/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { ActionExecutor } from "../execution/action-executor.js";
import type { CapabilityAwareToolCatalog } from "../orchestrator/tool-catalog.js";
import type { ConnectionService } from "../../connections/service.js";
import type { ConnectionCapability } from "@nexo/shared";
import { createAgentToolSchemas } from "../../llm/agent/tool-schema-factory.js";
import { AgentLoop } from "./agent-loop.js";
import { encodeObservation } from "./observation-encoder.js";
import type { AgentLoopState } from "./types.js";
import type { AgentRuntime } from "../runtime/runtime.js";
import { AgentContextManager } from "../context/agent-context-manager.js";
import type {ApprovalCoordinator} from "../approval/approval-coordinator.js";
import { AgentGraph } from "../graph/agent-graph.js";
import { randomUUID } from "node:crypto";
import type { LocalMetricsService } from "../../observability/metrics.js";

/** Bridges provider, current capability catalog and the sole execution authority. */
export class AgentLoopRunner {
  constructor(private readonly llm: LLMProvider, private readonly catalog: CapabilityAwareToolCatalog, private readonly registry: ToolRegistry, private readonly executor: ActionExecutor, private readonly connections?: ConnectionService,private readonly runtime?:AgentRuntime,private readonly contextManager=new AgentContextManager(),private readonly graph=new AgentGraph(),private readonly metrics?:LocalMetricsService) {}
  async run(userRequest: string, options: { mode: "read_only" | "full"; runId?: string; conversationId?:string;taskId?:string;messages?:AgentLoopState["messages"];signal?: AbortSignal } ): Promise<AgentLoopState> {
    if (!this.llm.agentTurn) throw new Error("O provider de LLM não implementa agentTurn().");
    const available = this.catalog.list().filter(tool => !tool.mutatesState || tool.risk === "READ" || options.mode === "full"&&Boolean(this.registry.get(tool.name)?.mutationSafety));
    const schemas = createAgentToolSchemas(available);
    const allowed = new Set(schemas.map(tool => tool.name));
    const loop = this.createLoop(schemas,allowed);
    const messages=this.contextManager.build(userRequest,options.messages??[]);
    const runId=options.runId??randomUUID();
    return this.graph.invoke(runId,()=>loop.run(userRequest, { runId,conversationId:options.conversationId,taskId:options.taskId,messages, signal: options.signal }));
  }
  async resumeApproved(state:AgentLoopState,approvalId:string,coordinator:ApprovalCoordinator,signal?:AbortSignal){if(state.status!=="WAITING_APPROVAL"||!state.pendingAction)throw new Error("Run não está aguardando aprovação.");const pending=state.pendingAction;if(pending.approvalId&&pending.approvalId!==approvalId)throw new Error("Approval não pertence à PendingAgentAction.");const available=this.catalog.list();const schemas=createAgentToolSchemas(available),allowed=new Set(schemas.map(tool=>tool.name));if(!allowed.has(pending.toolName))throw new Error("A ferramenta aprovada não está mais disponível.");const preflight=await this.executor.preflight(pending.toolName,pending.input,{runId:state.runId,executionId:pending.executionId,signal,capabilityResolver:permission=>this.hasCapability(permission,pending.input)});if(!preflight.ok)throw new Error(preflight.message);if(preflight.action.fingerprint!==pending.fingerprint||preflight.action.executionId!==pending.executionId)throw new Error("A ação mudou desde a aprovação.");coordinator.consumeApproved(approvalId,pending);state.status="EXECUTING";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);const execution=await this.executor.execute(preflight.action,{runId:state.runId,executionId:pending.executionId,dispatchAuthorized:true,signal});return this.createLoop(schemas,allowed).acceptExecution(state,preflight.action,execution,signal);}
  async reject(state:AgentLoopState,approvalId:string){if(state.status!=="WAITING_APPROVAL"||!state.pendingAction||state.pendingAction.approvalId!==approvalId)throw new Error("Approval não corresponde ao run.");state.messages.push({role:"tool",toolCallId:state.pendingAction.callId,trust:"TRUSTED_LOCAL",content:"APPROVAL_REJECTED: o usuário recusou a mutação. Não execute essa ação novamente sem novo pedido explícito."});state.observations.push({toolCallId:state.pendingAction.callId,toolName:state.pendingAction.toolName,ok:false,summary:"Ação rejeitada pelo usuário.",trust:"TRUSTED_LOCAL",truncated:false});state.pendingAction=undefined;state.status="DECIDING";state.updatedAt=new Date().toISOString();this.runtime?.saveLoopState(state.runId,state);const available=this.catalog.list().filter(tool=>!tool.mutatesState||tool.risk==="READ"),schemas=createAgentToolSchemas(available);return this.createLoop(schemas,new Set(available.map(tool=>tool.name))).resume(state);}
  async createLoopForRecovery(state:AgentLoopState){const available=this.catalog.list().filter(tool=>!tool.mutatesState||Boolean(this.registry.get(tool.name)?.mutationSafety)),schemas=createAgentToolSchemas(available);return this.graph.invoke(state.runId,previous=>this.createLoop(schemas,new Set(available.map(tool=>tool.name))).resume(previous??state),state);}
  private createLoop(schemas:ReturnType<typeof createAgentToolSchemas>,allowed:Set<string>){return new AgentLoop({
      agentTurn: (request, signal) => this.llm.agentTurn!({ ...request, tools: schemas }, signal), tools: () => schemas,
      preflight: (name, input, context) => {
        if (!allowed.has(name)) return Promise.resolve({ ok: false as const, code: "TOOL_NOT_FOUND" as const, message: "A ferramenta não está disponível neste modo do Agent Loop." });
        return this.executor.preflight(name, input, { ...context, capabilityResolver: permission => this.hasCapability(permission, input) });
      },
      execute: (action, context) => this.executor.execute(action, context),
      observe: (execution, callId) => {const tool=this.registry.get(execution.action.toolName),declared=tool?.agent?.outputTrust,trust=declared==="trusted_local"?"TRUSTED_LOCAL":declared==="sensitive_local"?"SENSITIVE_LOCAL":declared==="untrusted_external"||/^(email|calendar|browser)_/.test(tool?.name??"")?"UNTRUSTED_EXTERNAL":tool?.name.startsWith("memory_")||tool?.pathFields?.length?"SENSITIVE_LOCAL":"TRUSTED_LOCAL";return encodeObservation(callId, execution.action.toolName, execution.result ?? { ok: false, summary: "A execução não retornou resultado.", error: execution.error },trust);},
      persistence:this.runtime?{save:async state=>this.runtime!.saveLoopState(state.runId,state)}:undefined,
      metric:(name,value=1,labels)=>this.metrics?.record(name,value,labels)
    });}
  private hasCapability(permission: string, input: Record<string, unknown>) {
    const connectionCapability = new Set<ConnectionCapability>(["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"]);
    if (!connectionCapability.has(permission as ConnectionCapability)) return true;
    if (!this.connections) return false;
    const requested = typeof input.connectionId === "string" ? this.connections.get(input.connectionId)?.capabilities.includes(permission as ConnectionCapability) : this.connections.resolveForCapability(permission as ConnectionCapability).status === "ready";
    return Boolean(requested);
  }
}
