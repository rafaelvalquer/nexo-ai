import type { LLMProvider } from "../../llm/provider.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { ActionExecutor } from "../execution/action-executor.js";
import type { CapabilityAwareToolCatalog, AgentToolDescriptor } from "../orchestrator/tool-catalog.js";
import { ToolCandidateSelector } from "../orchestrator/tool-candidate-selector.js";
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
import type {AgentReconciliationCoordinator} from "../execution/reconciliation/agent-reconciliation-coordinator.js";
import { V2FastPathRouter } from "./v2-fast-path.js";

/** Bridges provider, a bounded capability catalog and the sole execution authority. */
export class AgentLoopRunner {
  private readonly candidates = new ToolCandidateSelector(10);
  private readonly fastPath = new V2FastPathRouter();
  constructor(private readonly llm: LLMProvider, private readonly catalog: CapabilityAwareToolCatalog, private readonly registry: ToolRegistry, private readonly executor: ActionExecutor, private readonly connections?: ConnectionService,private readonly runtime?:AgentRuntime,private readonly contextManager=new AgentContextManager(),private readonly graph=new AgentGraph(),private readonly metrics?:LocalMetricsService,private readonly reconciliation?:AgentReconciliationCoordinator) {}

  async run(userRequest: string, options: { mode: "read_only" | "full"; runId?: string; conversationId?:string;taskId?:string;messages?:AgentLoopState["messages"];signal?: AbortSignal } ): Promise<AgentLoopState> {
    if (!this.llm.agentTurn) throw new Error("O provider de LLM não implementa agentTurn().");
    const available = this.availableForMode(options.mode);
    const runId=options.runId??randomUUID();
    const messages=this.contextManager.build(userRequest,options.messages??[]);

    const fast=this.fastPath.resolve(userRequest,available);
    if(fast){const completed=await this.executeFastPath(userRequest,fast.name,fast.arguments,{runId,conversationId:options.conversationId,taskId:options.taskId,messages,signal:options.signal});if(completed)return completed;}

    const selected=this.candidates.select(userRequest,available,options.messages??[]);
    this.metrics?.record("agent.candidate_tool_count",selected.length,{mode:options.mode});
    const schemas=createAgentToolSchemas(selected),allowed=new Set(schemas.map(tool=>tool.name));
    const loop=this.createLoop(schemas,allowed);
    try{return await this.graph.invoke(runId,()=>loop.run(userRequest,{runId,conversationId:options.conversationId,taskId:options.taskId,messages,signal:options.signal}));}
    catch(error){if(error&&typeof error==="object")Object.assign(error,{runId});throw error;}
  }

  async resumeApproved(state:AgentLoopState,approvalId:string,coordinator:ApprovalCoordinator,signal?:AbortSignal){
    if(state.status!=="WAITING_APPROVAL"||!state.pendingAction)throw new Error("Run não está aguardando aprovação.");
    const pending=state.pendingAction;if(pending.approvalId&&pending.approvalId!==approvalId)throw new Error("Approval não pertence à PendingAgentAction.");
    const available=this.availableForMode("full"),selected=this.ensureTool(this.candidates.select(state.userRequest,available,state.messages),available,pending.toolName);
    const schemas=createAgentToolSchemas(selected),allowed=new Set(schemas.map(tool=>tool.name));if(!allowed.has(pending.toolName))throw new Error("A ferramenta aprovada não está mais disponível.");
    const definition=this.registry.get(pending.toolName);if(!definition)throw new Error("A ferramenta aprovada não está registrada.");
    const action={executionId:pending.executionId,toolName:pending.toolName,input:pending.input,fingerprint:pending.fingerprint,idempotencyKey:pending.idempotencyKey,mutatesState:pending.mutatesState,risk:pending.risk??definition.risk,requiresApproval:pending.requiresApproval??true,status:"PREPARED" as const};
    coordinator.consumeApproved(approvalId,pending);state.status="EXECUTING";state.executionSafetyState="DISPATCHING";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);
    const execution=await this.executor.executePrepared(action,{runId:state.runId,conversationId:state.conversationId,taskId:state.taskId,executionId:pending.executionId,dispatchAuthorized:true,signal});
    return this.createLoop(schemas,allowed).acceptExecution(state,action,execution,signal);
  }

  async reject(state:AgentLoopState,approvalId:string){
    if(state.status!=="WAITING_APPROVAL"||!state.pendingAction||state.pendingAction.approvalId!==approvalId)throw new Error("Approval não corresponde ao run.");
    state.messages.push({role:"tool",toolCallId:state.pendingAction.callId,toolName:state.pendingAction.toolName,trust:"TRUSTED_LOCAL",content:"APPROVAL_REJECTED: o usuário recusou a mutação. Não execute essa ação novamente sem novo pedido explícito."});
    state.observations.push({toolCallId:state.pendingAction.callId,toolName:state.pendingAction.toolName,ok:false,summary:"Ação rejeitada pelo usuário.",trust:"TRUSTED_LOCAL",truncated:false});state.pendingAction=undefined;state.status="DECIDING";state.updatedAt=new Date().toISOString();this.runtime?.saveLoopState(state.runId,state);
    const available=this.availableForMode("read_only"),selected=this.candidates.select(state.userRequest,available,state.messages),schemas=createAgentToolSchemas(selected);
    return this.createLoop(schemas,new Set(selected.map(tool=>tool.name))).resume(state);
  }

  async createLoopForRecovery(state:AgentLoopState){
    const available=this.availableForMode("full"),selected=this.candidates.select(state.userRequest,available,state.messages),schemas=createAgentToolSchemas(selected);
    return this.graph.invoke(state.runId,previous=>this.createLoop(schemas,new Set(selected.map(tool=>tool.name))).resume(previous??state),state);
  }

  private availableForMode(mode:"read_only"|"full") {return this.catalog.list().filter(tool=>!tool.mutatesState||tool.risk==="READ"||mode==="full"&&Boolean(this.registry.get(tool.name)?.mutationSafety));}

  private async executeFastPath(userRequest:string,toolName:string,input:Record<string,unknown>,options:{runId:string;conversationId?:string;taskId?:string;messages:AgentLoopState["messages"];signal?:AbortSignal}):Promise<AgentLoopState|undefined>{
    const tool=this.registry.get(toolName);if(!tool||(tool.mutatesState??tool.risk!=="READ"))return undefined;
    const preflight=await this.executor.preflight(toolName,input,{runId:options.runId,conversationId:options.conversationId,taskId:options.taskId,userRequest,signal:options.signal,capabilityResolver:permission=>this.hasCapability(permission,input)});
    if(!preflight.ok){this.metrics?.record("agent.fast_path_rejected",1,{tool:toolName,code:preflight.code});return undefined;}
    const now=new Date().toISOString();const state:AgentLoopState={version:2,runId:options.runId,conversationId:options.conversationId,taskId:options.taskId,userRequest,messages:options.messages,observations:[],iteration:0,toolCallCount:0,consecutiveFailures:0,protocolRepairCount:0,actionFingerprints:[preflight.action.fingerprint],observationFingerprints:[],startedAt:now,updatedAt:now,deadlineAt:new Date(Date.now()+120_000).toISOString(),status:"EXECUTING",executionSafetyState:"NO_ACTION"};
    await this.runtime?.saveLoopState(state.runId,state);
    const execution=await this.executor.executePrepared(preflight.action,{runId:state.runId,conversationId:state.conversationId,taskId:state.taskId,signal:options.signal});
    if(execution.status!=="SUCCEEDED"||!execution.result){this.metrics?.record("agent.fast_path_failed",1,{tool:toolName,status:execution.status});return undefined;}
    const observation=this.toObservation(execution,`fast-${randomUUID()}`);state.observations.push(observation);state.messages.push({role:"assistant",content:"",toolCalls:[{id:observation.toolCallId,name:toolName,arguments:preflight.action.input}],trust:"TRUSTED_LOCAL"});state.messages.push({role:"tool",toolCallId:observation.toolCallId,toolName,content:JSON.stringify({source:observation.toolName,summary:observation.summary,data:observation.data,references:observation.references}),trust:observation.trust});state.toolCallCount=1;state.iteration=1;state.executionSafetyState="READ_ONLY_EXECUTED";state.finalResponse=execution.result.summary;state.status="COMPLETED";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);this.metrics?.record("agent.fast_path_hit",1,{tool:toolName});return state;
  }

  private createLoop(schemas:ReturnType<typeof createAgentToolSchemas>,allowed:Set<string>){return new AgentLoop({
      agentTurn:(request,signal)=>this.llm.agentTurn!({...request,tools:schemas},signal),tools:()=>schemas,
      preflight:(name,input,context)=>{if(!allowed.has(name))return Promise.resolve({ok:false as const,code:"TOOL_NOT_FOUND" as const,message:"A ferramenta não está disponível neste turno do Agent Loop."});return this.executor.preflight(name,input,{...context,capabilityResolver:permission=>this.hasCapability(permission,input)});},
      execute:(action,context)=>this.executor.executePrepared(action,context),reconcileRun:this.reconciliation?(state,executionId,signal)=>this.reconciliation!.reconcileRun(state,executionId,signal):undefined,
      observe:(execution,callId)=>this.toObservation(execution,callId),
      persistence:this.runtime?{save:async state=>this.runtime!.saveLoopState(state.runId,state)}:undefined,
      metric:(name,value=1,labels)=>this.metrics?.record(name,value,labels)
    });}

  private toObservation(execution:Awaited<ReturnType<ActionExecutor["executePrepared"]>>,callId:string){const tool=this.registry.get(execution.action.toolName),declared=tool?.agent?.outputTrust,trust=declared==="trusted_local"?"TRUSTED_LOCAL":declared==="sensitive_local"?"SENSITIVE_LOCAL":declared==="untrusted_external"||/^(email|calendar|browser)_/.test(tool?.name??"")?"UNTRUSTED_CONTENT":tool?.name.startsWith("memory_")||tool?.pathFields?.length?"SENSITIVE_LOCAL":"TRUSTED_LOCAL";return encodeObservation(callId,execution.action.toolName,execution.result??{ok:false,summary:"A execução não retornou resultado.",error:execution.error},trust);}

  private ensureTool(selected:AgentToolDescriptor[],available:AgentToolDescriptor[],name:string){if(selected.some(tool=>tool.name===name))return selected;const required=available.find(tool=>tool.name===name);return required?[required,...selected].slice(0,10):selected;}

  private hasCapability(permission: string, input: Record<string, unknown>) {
    const connectionCapability = new Set<ConnectionCapability>(["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"]);
    if (!connectionCapability.has(permission as ConnectionCapability)) return true;
    if (!this.connections) return false;
    const requested = typeof input.connectionId === "string" ? this.connections.get(input.connectionId)?.capabilities.includes(permission as ConnectionCapability) : this.connections.resolveForCapability(permission as ConnectionCapability).status === "ready";
    return Boolean(requested);
  }
}
