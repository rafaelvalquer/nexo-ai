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
import { modelVisiblePresentationData, wrapPresentationData } from "../../chat/presentation/internal-metadata.js";
import { emailSendCapabilityRemediation, isEmailSendRequest, resolveEmailSendCapability } from "../orchestrator/email-capability-remediation.js";
import { GoalBuilder } from "../goal/goal-builder.js";
import type { AgentResourceContext } from "../goal/goal-types.js";
import { EntityReferenceResolver } from "../resolution/entity-reference-resolver.js";
import { ModelRouter } from "../model/model-router.js";
import { DateTimeResolver } from "../resolution/datetime-resolver.js";

const PRESENTATION_INPUT_TOOLS = new Set(["email_search", "email_get", "email_get_many", "email_get_thread", "email_latest"]);

/** Bridges provider, a bounded capability catalog and the sole execution authority. */
export class AgentLoopRunner {
  private readonly candidates = new ToolCandidateSelector(6);
  private readonly fastPath = new V2FastPathRouter();
  private readonly modelRouter = new ModelRouter();
  constructor(private readonly llm: LLMProvider, private readonly catalog: CapabilityAwareToolCatalog, private readonly registry: ToolRegistry, private readonly executor: ActionExecutor, private readonly connections?: ConnectionService,private readonly runtime?:AgentRuntime,private readonly contextManager=new AgentContextManager(),private readonly graph=new AgentGraph(),private readonly metrics?:LocalMetricsService,private readonly reconciliation?:AgentReconciliationCoordinator) {}

  async run(userRequest: string, options: { mode: "read_only" | "full"; runId?: string; conversationId?:string;taskId?:string;messages?:AgentLoopState["messages"];resources?:AgentResourceContext;signal?: AbortSignal } ): Promise<AgentLoopState> {
    if (!this.llm.agentTurn) throw new Error("O provider de LLM não implementa agentTurn().");
    const runId=options.runId??randomUUID();
    const messages=this.contextManager.build(userRequest,options.messages??[]);
    const temporal=new DateTimeResolver().context();messages.push({role:"system",trust:"TRUSTED_LOCAL",content:`Contexto temporal determinístico do Core: agora=${temporal.now}; timezone=${temporal.timeZone}; hoje=${temporal.today}; amanhã=${temporal.tomorrow}; depois_de_amanhã=${temporal.dayAfterTomorrow}. Use datas naturais nas tools agent-facing; o Core normaliza ISO.`});
    if(options.conversationId&&this.runtime){const entity=new EntityReferenceResolver(this.runtime.entities).resolve(options.conversationId,userRequest);if(entity){messages.push({role:"system",trust:"TRUSTED_LOCAL",content:`Referência ordinal resolvida pelo Core: ${entity.kind} id=${entity.id}${entity.path?` path=${entity.path}`:""}.`});this.metrics?.record("agent.entity_reference_resolved",1,{kind:entity.kind});}else if(/\b(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa])\b/i.test(userRequest))this.metrics?.record("agent.entity_reference_failed",1);}
    if(options.resources?.documents.length)messages.push({role:"system",trust:"TRUSTED_LOCAL",content:`Documentos disponíveis como resources (use tools document_* para acessar conteúdo):\n${options.resources.documents.map(document=>`ID: ${document.id}\nNome: ${document.name}\nTipo: ${document.mimeType}`).join("\n\n")}`});

    // Capability repair may change the operational tool set. Always perform it
    // before taking the per-turn catalog snapshot, otherwise this turn can keep
    // a stale list that omits email_send_composed even after email.send is healed.
    const remediation=await this.emailSendRemediation(userRequest);
    if(remediation){this.metrics?.record("agent.capability_remediation",1,{capability:"email.send"});return this.completeWithoutExecution(userRequest,remediation,{runId,conversationId:options.conversationId,taskId:options.taskId,messages});}
    const available = this.availableForMode(options.mode);

    const fast=this.fastPath.resolve(userRequest,available);
    if(fast){
      if("rejected" in fast){this.metrics?.record("agent.fast_path_rejected",1,{tool:"create_text_file",code:fast.code});return this.completeWithoutExecution(userRequest,fast.message,{runId,conversationId:options.conversationId,taskId:options.taskId,messages});}
      const completed=await this.executeFastPath(userRequest,fast.name,fast.arguments,{runId,conversationId:options.conversationId,taskId:options.taskId,messages,signal:options.signal});if(completed)return completed;
    }

    const loop=this.createLoop(options.mode,available);
    const taskState=new GoalBuilder().build(userRequest,options.resources);
    const route=this.modelRouter.route(userRequest,taskState.goal.steps.length);const installed=typeof this.llm.models==="function"?await this.llm.models().catch(()=>[]):[];const model=route.model&&installed.some(name=>name===route.model||name.startsWith(`${route.model}:`))?route.model:undefined;this.metrics?.record("agent.model_route",1,{profile:route.profile,reason:route.reason,model:model??"provider_default"});
    try{return await this.graph.invoke(runId,()=>loop.run(userRequest,{runId,conversationId:options.conversationId,taskId:options.taskId,messages,resources:options.resources,taskState,model,signal:options.signal}));}
    catch(error){if(error&&typeof error==="object")Object.assign(error,{runId});throw error;}
  }

  async resumeApproved(state:AgentLoopState,approvalId:string,coordinator:ApprovalCoordinator,signal?:AbortSignal){
    if(state.status!=="WAITING_APPROVAL"||!state.pendingAction)throw new Error("Run não está aguardando aprovação.");
    const pending=state.pendingAction;if(pending.approvalId&&pending.approvalId!==approvalId)throw new Error("Approval não pertence à PendingAgentAction.");
    const available=this.availableForMode("full");if(!available.some(tool=>tool.name===pending.toolName))throw new Error("A ferramenta aprovada não está mais disponível.");
    const definition=this.registry.get(pending.toolName);if(!definition)throw new Error("A ferramenta aprovada não está registrada.");
    const action={executionId:pending.executionId,toolName:pending.toolName,input:pending.input,fingerprint:pending.fingerprint,idempotencyKey:pending.idempotencyKey,mutatesState:pending.mutatesState,risk:pending.risk??definition.risk,requiresApproval:pending.requiresApproval??true,status:"PREPARED" as const};
    const current=await this.executor.revalidatePreparedAction(action,{runId:state.runId,userRequest:state.userRequest,conversationId:state.conversationId,taskId:state.taskId,executionId:pending.executionId,signal,capabilityResolver:permission=>this.hasCapability(permission,pending.input)});
    if(!current.ok){state.finalResponse=`${current.code}: ${current.message}`;state.pendingAction=undefined;state.executionSafetyState="NO_ACTION";state.status="FAILED";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);throw new Error(state.finalResponse);}
    coordinator.consumeApproved(approvalId,pending);state.status="EXECUTING";state.executionSafetyState="DISPATCHING";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);
    const execution=await this.executor.executePrepared(action,{runId:state.runId,conversationId:state.conversationId,taskId:state.taskId,executionId:pending.executionId,dispatchAuthorized:true,signal});
    if(pending.callId.startsWith("fast-")&&execution.status==="SUCCEEDED"&&execution.result){
      const observation=this.toObservation(execution,pending.callId);state.observations.push(observation);state.messages.push({role:"assistant",content:"",toolCalls:[{id:pending.callId,name:pending.toolName,arguments:sanitizeAgentArguments(pending.input)}],trust:"TRUSTED_LOCAL"});state.messages.push({role:"tool",toolCallId:pending.callId,toolName:pending.toolName,content:JSON.stringify({source:observation.toolName,summary:observation.summary,data:modelVisiblePresentationData(observation.data),references:observation.references}),trust:observation.trust});state.toolCallCount++;state.iteration++;state.pendingAction=undefined;state.executionSafetyState=action.mutatesState?"MUTATION_COMPLETED":"READ_ONLY_EXECUTED";state.finalResponse=execution.result.summary;state.status="COMPLETED";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);this.metrics?.record("agent.fast_path_completed",1,{tool:pending.toolName});return state;
    }
    return this.createLoop("full",available).acceptExecution(state,action,execution,signal);
  }

  async reject(state:AgentLoopState,approvalId:string){
    if(state.status!=="WAITING_APPROVAL"||!state.pendingAction||state.pendingAction.approvalId!==approvalId)throw new Error("Approval não corresponde ao run.");
    state.messages.push({role:"tool",toolCallId:state.pendingAction.callId,toolName:state.pendingAction.toolName,trust:"TRUSTED_LOCAL",content:"APPROVAL_REJECTED: o usuário recusou a mutação. Não execute essa ação novamente sem novo pedido explícito."});
    state.observations.push({toolCallId:state.pendingAction.callId,toolName:state.pendingAction.toolName,ok:false,summary:"Ação rejeitada pelo usuário.",trust:"TRUSTED_LOCAL",truncated:false});state.pendingAction=undefined;state.status="DECIDING";state.updatedAt=new Date().toISOString();this.runtime?.saveLoopState(state.runId,state);
    return this.createLoop("read_only",this.availableForMode("read_only")).resume(state);
  }

  async createLoopForRecovery(state:AgentLoopState){
    const available=this.availableForMode("full");const recovered=await this.graph.invoke(state.runId,previous=>this.createLoop("full",available).resume(previous??state),state);this.metrics?.record("agent.recovery_success",1,{runId:state.runId,status:recovered.status});return recovered;
  }

  private availableForMode(mode:"read_only"|"full") {return this.catalog.list().filter(tool=>!tool.mutatesState||tool.risk==="READ"||mode==="full"&&Boolean(this.registry.get(tool.name)?.mutationSafety));}

  private async executeFastPath(userRequest:string,toolName:string,input:Record<string,unknown>,options:{runId:string;conversationId?:string;taskId?:string;messages:AgentLoopState["messages"];signal?:AbortSignal}):Promise<AgentLoopState|undefined>{
    const tool=this.registry.get(toolName);if(!tool)return undefined;
    const preflight=await this.executor.preflight(toolName,input,{runId:options.runId,conversationId:options.conversationId,taskId:options.taskId,userRequest,signal:options.signal,capabilityResolver:permission=>this.hasCapability(permission,input)});
    if(!preflight.ok){this.metrics?.record("agent.fast_path_rejected",1,{tool:toolName,code:preflight.code});if(preflight.code==="PATH_DENIED"||preflight.code==="SECURITY_DENIED")return this.completeWithoutExecution(userRequest,`${preflight.code}: ${preflight.message}`,options);return undefined;}
    const now=new Date().toISOString();const state:AgentLoopState={version:2,runId:options.runId,conversationId:options.conversationId,taskId:options.taskId,userRequest,messages:options.messages,observations:[],iteration:0,toolCallCount:0,consecutiveFailures:0,protocolRepairCount:0,actionFingerprints:[preflight.action.fingerprint],observationFingerprints:[],activeToolNames:[],startedAt:now,updatedAt:now,deadlineAt:new Date(Date.now()+120_000).toISOString(),status:"EXECUTING",executionSafetyState:"NO_ACTION"};
    if(preflight.action.requiresApproval){state.pendingAction={callId:`fast-${randomUUID()}`,toolName:preflight.action.toolName,input:preflight.action.input,fingerprint:preflight.action.fingerprint,executionId:preflight.action.executionId,idempotencyKey:preflight.action.idempotencyKey,iteration:0,mutatesState:preflight.action.mutatesState,risk:preflight.action.risk,requiresApproval:true};state.status="WAITING_APPROVAL";state.executionSafetyState="WAITING_APPROVAL";await this.runtime?.saveLoopState(state.runId,state);this.metrics?.record("agent.fast_path_hit",1,{tool:toolName,approval:true});return state;}
    await this.runtime?.saveLoopState(state.runId,state);
    const execution=await this.executor.executePrepared(preflight.action,{runId:state.runId,conversationId:state.conversationId,taskId:state.taskId,signal:options.signal});
    if(execution.status!=="SUCCEEDED"||!execution.result){this.metrics?.record("agent.fast_path_failed",1,{tool:toolName,status:execution.status});return undefined;}
    const observation=this.toObservation(execution,`fast-${randomUUID()}`);state.observations.push(observation);state.messages.push({role:"assistant",content:"",toolCalls:[{id:observation.toolCallId,name:toolName,arguments:sanitizeAgentArguments(preflight.action.input)}],trust:"TRUSTED_LOCAL"});state.messages.push({role:"tool",toolCallId:observation.toolCallId,toolName,content:JSON.stringify({source:observation.toolName,summary:observation.summary,data:modelVisiblePresentationData(observation.data),references:observation.references}),trust:observation.trust});state.toolCallCount=1;state.iteration=1;state.executionSafetyState="READ_ONLY_EXECUTED";state.finalResponse=execution.result.summary;state.status="COMPLETED";state.updatedAt=new Date().toISOString();await this.runtime?.saveLoopState(state.runId,state);this.metrics?.record("agent.fast_path_hit",1,{tool:toolName});return state;
  }

  private createLoop(mode:"read_only"|"full",available=this.availableForMode(mode)){return new AgentLoop({
      agentTurn:(request,signal)=>this.llm.agentTurn!(request,signal),
      toolsForTurn:async state=>{const selectionContext=state.messages.filter(message=>message.role!=="system");const selected=this.candidates.select(state.userRequest,available,selectionContext,state.taskState);const names=selected.map(tool=>tool.name);if(state.activeToolNames.length&&names.join("|")!==state.activeToolNames.join("|"))this.metrics?.record("agent.tool_reselection",1,{mode});this.metrics?.record("agent.candidate_tool_count",selected.length,{mode});return createAgentToolSchemas(selected);},
      preflight:(name,input,context)=>{const resolved=this.resolveEntityInput(name,input,context.conversationId,context.userRequest);return this.executor.preflight(name,resolved,{...context,capabilityResolver:permission=>this.hasCapability(permission,resolved)});},
      execute:(action,context)=>this.executor.executePrepared(action,context),reconcileRun:this.reconciliation?(state,executionId,signal)=>this.reconciliation!.reconcileRun(state,executionId,signal):undefined,
      observe:(execution,callId)=>this.toObservation(execution,callId),
      onObservation:(state,observation)=>{if(state.conversationId)this.runtime?.entities.record(state.conversationId,observation);},
      persistence:this.runtime?{save:async state=>this.runtime!.saveLoopState(state.runId,state)}:undefined,
      metric:(name,value=1,labels)=>this.metrics?.record(name,value,labels)
    });}

  private toObservation(execution:Awaited<ReturnType<ActionExecutor["executePrepared"]>>,callId:string){
    const tool=this.registry.get(execution.action.toolName),declared=tool?.agent?.outputTrust,trust=declared==="trusted_local"?"TRUSTED_LOCAL":declared==="sensitive_local"?"SENSITIVE_LOCAL":declared==="untrusted_external"||/^(email|calendar|browser)_/.test(tool?.name??"")?"UNTRUSTED_CONTENT":tool?.name.startsWith("memory_")||tool?.pathFields?.length?"SENSITIVE_LOCAL":"TRUSTED_LOCAL";
    const observation=encodeObservation(callId,execution.action.toolName,execution.result??{ok:false,summary:"A execução não retornou resultado.",error:execution.error},trust);
    if(PRESENTATION_INPUT_TOOLS.has(execution.action.toolName)&&typeof execution.action.input.connectionId==="string"){
      const connectionId=execution.action.input.connectionId;
      const account=this.connections?.get(connectionId);
      observation.data=wrapPresentationData(observation.data,{...execution.action.input,__connectionCapabilities:account?.capabilities??[]});
    }
    return observation;
  }

  private ensureTool(selected:AgentToolDescriptor[],available:AgentToolDescriptor[],name:string){if(selected.some(tool=>tool.name===name))return selected;const required=available.find(tool=>tool.name===name);return required?[required,...selected].slice(0,10):selected;}

  private resolveEntityInput(toolName:string,input:Record<string,unknown>,conversationId?:string,userRequest?:string){
    if(!conversationId||!userRequest||!this.runtime)return input;
    const entity=new EntityReferenceResolver(this.runtime.entities).resolve(conversationId,userRequest);
    if(!entity)return input;
    const next={...input};
    if(entity.kind==="email"&&toolName.startsWith("email_")&&next.messageId===undefined)next.messageId=entity.id;
    if(entity.kind==="event"&&toolName.startsWith("calendar_")&&next.eventId===undefined)next.eventId=entity.id;
    if(entity.kind==="document"&&toolName.startsWith("document_")&&next.documentId===undefined&&next.documentIds===undefined){
      if(["document_search","document_summarize","document_extract"].includes(toolName))next.documentIds=[entity.id];
      else next.documentId=entity.id;
    }
    if(entity.kind==="file"&&(/file|folder|path|document_import/.test(toolName))&&next.path===undefined)next.path=entity.path??entity.id;
    if(JSON.stringify(next)!==JSON.stringify(input))this.metrics?.record("agent.context_reference_resolved",1,{kind:entity.kind,tool:toolName});
    return next;
  }

  private hasCapability(permission: string, input: Record<string, unknown>) {
    const connectionCapability = new Set<ConnectionCapability>(["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"]);
    if (!connectionCapability.has(permission as ConnectionCapability)) return true;
    if (!this.connections) return false;
    const requested = typeof input.connectionId === "string" ? this.connections.get(input.connectionId)?.capabilities.includes(permission as ConnectionCapability) : this.connections.resolveForCapability(permission as ConnectionCapability).status === "ready";
    return Boolean(requested);
  }

  private async emailSendRemediation(userRequest:string){
    if(!this.connections||!isEmailSendRequest(userRequest))return undefined;
    const resolution=await resolveEmailSendCapability(this.connections);
    return emailSendCapabilityRemediation(resolution);
  }

  private async completeWithoutExecution(userRequest:string,finalResponse:string,options:{runId:string;conversationId?:string;taskId?:string;messages:AgentLoopState["messages"]}){
    const now=new Date().toISOString();
    const state:AgentLoopState={version:2,runId:options.runId,conversationId:options.conversationId,taskId:options.taskId,userRequest,messages:options.messages,observations:[],iteration:0,toolCallCount:0,consecutiveFailures:0,protocolRepairCount:0,actionFingerprints:[],observationFingerprints:[],activeToolNames:[],startedAt:now,updatedAt:now,deadlineAt:new Date(Date.now()+120_000).toISOString(),status:"COMPLETED",executionSafetyState:"NO_ACTION",finalResponse};
    await this.runtime?.saveLoopState(state.runId,state);return state;
  }
}

function sanitizeAgentArguments(arguments_:Record<string,unknown>){const sanitized={...arguments_};delete sanitized.connectionId;return sanitized;}
