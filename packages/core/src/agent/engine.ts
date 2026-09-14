import path from "node:path";
import type { ToolResult,VisualExecutionContext,ConnectionCapability } from "@nexo/shared";
import { AgentPlanner,type PlanStep,type Plan } from "./planner.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionEngine } from "../permissions/policy.js";
import { ApprovalService } from "../permissions/approvals.js";
import { AuditService } from "../audit/audit.js";
import type { ConnectionService } from "../connections/service.js";
import type { LLMMessage } from "../llm/provider.js";
import { AGENT_LIMITS } from "./runtime/limits.js";
import { AgentRuntime } from "./runtime/runtime.js";
import type { SecurityPolicyService } from "../security/policy.js";
import type { LocalMetricsService } from "../observability/metrics.js";
import type { ResourceManager } from "../runtime/resource-manager.js";
import type { ToolDefinition,ToolExecutionContext } from "../tools/types.js";
import { OllamaConnectionError,OllamaInvalidResponseError,OllamaModelNotFoundError,OllamaTimeoutError,OllamaUnavailableError } from "../llm/errors.js";
import { CapabilityAwareToolCatalog } from "./orchestrator/tool-catalog.js";
import { buildConfirmation,confirmationText } from "./orchestrator/confirmation-builder.js";

export type AgentReply={text:string;result?:ToolResult;results?:ToolResult[];approvalId?:string};
export type AgentRunHooks={onStatus?:(message:string)=>void;onToken?:(token:string)=>void;onReplaceText?:(text:string)=>void;signal?:AbortSignal;onToolStarted?:(toolName:string,label:string)=>void;onToolCompleted?:(toolName:string,ok:boolean)=>void;onApprovalRequested?:(approvalId:string,toolName:string)=>void;visualContext?:VisualExecutionContext};

export class AgentEngine{
  private readonly toolCatalog:CapabilityAwareToolCatalog;
  constructor(private planner:AgentPlanner,private registry:ToolRegistry,private permissions:PermissionEngine,private approvals:ApprovalService,private audit:AuditService,private connections?:ConnectionService,private runtime?:AgentRuntime,private security?:SecurityPolicyService,private metrics?:LocalMetricsService,private resources?:ResourceManager){this.toolCatalog=new CapabilityAwareToolCatalog(registry,connections);}

  async run(userText:string,hooks:AgentRunHooks={},context:LLMMessage[]=[]):Promise<AgentReply>{
    const conversationId=hooks.visualContext?.conversationId;
    const previous=this.runtime?.getConversationActionContext(conversationId);
    let plan:Plan;
    try{hooks.onStatus?.("Interpretando sua intenção com a IA local…");plan=await this.planner.plan(userText,context,hooks.signal,previous,this.toolCatalog.list());}
    catch(error){const text=this.formatOllamaError(error,"interpretar este pedido");hooks.onReplaceText?.(text);hooks.onStatus?.("Não foi possível concluir a interpretação.");return{text};}

    if(plan.directStream){hooks.onStatus?.("Conversa identificada. Preparando a IA local…");hooks.onReplaceText?.("");try{hooks.onStatus?.("A IA local está gerando a resposta…");const streamed=await this.planner.streamDirectAnswer(userText,token=>hooks.onToken?.(token),context,hooks.signal);hooks.onStatus?.("Resposta concluída.");return{text:streamed};}catch(error){const text=this.formatOllamaError(error,"gerar a resposta");hooks.onReplaceText?.(text);hooks.onStatus?.("A geração da resposta foi interrompida.");return{text};}}
    if(typeof plan.direct==="string"){hooks.onReplaceText?.(plan.direct);hooks.onStatus?.("Resposta concluída.");return{text:plan.direct};}

    const steps:PlanStep[]=plan.steps??(plan.tool?[{tool:plan.tool,input:plan.input??{},explanation:plan.explanation}]:[]);
    if(!steps.length){const text="Não identifiquei uma ação segura para executar.";hooks.onReplaceText?.(text);return{text};}
    if(steps.length>AGENT_LIMITS.maxToolCalls){const text="O plano excedeu o limite seguro de etapas.";hooks.onReplaceText?.(text);return{text};}
    hooks.onStatus?.("Plano validado pelo Core. Preparando execução…");

    const persistedRun=this.runtime?.start(userText,steps,{conversationId,taskId:hooks.visualContext?.taskId,agentId:hooks.visualContext?.agentId},{intent:plan.intent,deferredAction:plan.deferredAction,responseMode:plan.responseMode});
    const done:{step:PlanStep;result:ToolResult}[]=[];
    let previousContext=previous;
    let deferredConsumed=false;
    let modelFinalResponse:string|undefined;

    for(let stepIndex=0;stepIndex<steps.length;stepIndex++){
      const step=steps[stepIndex];
      this.assertNotAborted(hooks.signal);
      if(stepIndex>=AGENT_LIMITS.maxIterations){const text="O agente atingiu o limite seguro de iterações.";hooks.onReplaceText?.(text);if(persistedRun)this.runtime?.finish(persistedRun.id,"FAILED",text);return{text,results:done.map(x=>x.result)};}
      hooks.onStatus?.(step.explanation??`Executando ${step.tool}…`);hooks.onToolStarted?.(step.tool,step.explanation??`Executando ${step.tool}`);if(persistedRun)this.runtime?.recordStep(persistedRun.id,stepIndex,step,"RUNNING");
      const prepared=this.prepareStep(step,hooks);if("reply"in prepared)return prepared.reply;const{tool,data}=prepared;step.input=data;
      const needsMemoryApproval=step.tool==="memory_save"&&plan.origin==="llm"&&this.permissions.requiresAutomaticMemoryApproval();
      if(this.needsApproval(tool,needsMemoryApproval)){
        const meta=buildConfirmation(step,tool,data);
        const reason=needsMemoryApproval?"A IA identificou uma memória para salvar e sua configuração exige confirmação.":meta.consequence??step.explanation??"Ação requer aprovação";
        const checkpointState={userRequest:userText,steps,nextStep:stepIndex,results:done.map(x=>x.result),iteration:stepIndex,intent:plan.intent,deferredAction:deferredConsumed?undefined:plan.deferredAction,responseMode:plan.responseMode};
        const checkpointId=persistedRun&&this.runtime?this.runtime.checkpoint(persistedRun.id,checkpointState):undefined;
        const approval=this.approvals.create(tool.name,data,tool.risk,reason,checkpointId&&persistedRun?{agentRunId:persistedRun.id,checkpointId,...hooks.visualContext}:undefined,meta);
        if(checkpointId)this.runtime?.attachApproval(checkpointId,approval.id);
        this.audit.record(tool.name,tool.risk,"awaiting_approval",{input:data,affectedCount:meta.affectedCount});
        const text=confirmationText(tool,meta);hooks.onReplaceText?.(text);hooks.onStatus?.("Aguardando sua confirmação.");hooks.onApprovalRequested?.(approval.id,tool.name);return{text,approvalId:approval.id,results:done.map(x=>x.result)};
      }

      const reply=await this.execute(tool.name,data,this.executionContext(hooks));hooks.onToolCompleted?.(tool.name,Boolean(reply.result?.ok));if(persistedRun)this.runtime?.recordStep(persistedRun.id,stepIndex,step,reply.result?.ok?"COMPLETED":"FAILED",reply.result,reply.result?.error);
      if(reply.result){done.push({step,result:reply.result});previousContext=this.planner.observe(previousContext,userText,plan,step,reply.result);if(conversationId)this.runtime?.saveConversationActionContext(conversationId,previousContext);}
      if(reply.result&&!reply.result.ok){hooks.onReplaceText?.(reply.text);hooks.onStatus?.("A ferramenta retornou uma falha.");return{text:reply.text,result:reply.result,results:done.map(x=>x.result)};}
      hooks.onStatus?.(`${tool.description}: concluído.`);

      if(plan.deferredAction&&!deferredConsumed&&reply.result){
        const materialized=this.planner.materialize(plan,reply.result);deferredConsumed=true;
        if(materialized?.direct){hooks.onReplaceText?.(materialized.direct);hooks.onStatus?.("Prévia concluída sem alterações.");if(persistedRun)this.runtime?.finish(persistedRun.id,"COMPLETED",materialized.direct);return{text:materialized.direct,result:reply.result,results:done.map(x=>x.result)};}
        if(materialized?.step){if(steps.length>=AGENT_LIMITS.maxToolCalls){const text="A ação exigiria etapas demais para o limite seguro.";return{text,results:done.map(x=>x.result)};}steps.push(materialized.step);}
      }

      if(!plan.intent&&plan.origin==="llm"&&stepIndex===steps.length-1&&done.length<AGENT_LIMITS.maxToolCalls){try{const next=await this.planner.decideNext(userText,done.map(x=>x.result),context);if(typeof next.direct==="string"&&next.direct.trim())modelFinalResponse=next.direct;else if(next.tool)steps.push({tool:next.tool,input:next.input??{},explanation:next.explanation});}catch{}}
      if(persistedRun)this.runtime?.saveState(persistedRun.id,{userRequest:userText,steps,nextStep:stepIndex+1,results:done.map(x=>x.result),iteration:stepIndex+1,intent:plan.intent,deferredAction:deferredConsumed?undefined:plan.deferredAction,responseMode:plan.responseMode});
      if(modelFinalResponse)break;
    }

    const fallback=modelFinalResponse?{text:modelFinalResponse,results:done.map(x=>x.result)}:done.length===1?{text:done[0].result.summary,result:done[0].result}:{text:this.formatResults(done),results:done.map(x=>x.result)};
    let finalReply:AgentReply=fallback;
    const shouldSynthesize=plan.responseMode==="synthesize"&&done.length>0;
    if(shouldSynthesize){try{hooks.onStatus?.("Sintetizando os resultados com a IA local…");finalReply={...fallback,text:await this.planner.synthesize(userText,done.map(x=>x.result),hooks.signal)};}catch{}}
    hooks.onReplaceText?.(finalReply.text);hooks.onStatus?.("Tarefa concluída.");this.metrics?.record("agent.tool_calls",done.length,{origin:plan.origin??"unknown"});this.metrics?.record("agent.iterations",steps.length,{origin:plan.origin??"unknown"});if(persistedRun)this.runtime?.finish(persistedRun.id,"COMPLETED",finalReply.text);return finalReply;
  }

  async resumeApproval(checkpointId:string,hooks:AgentRunHooks={}):Promise<AgentReply>{
    this.assertNotAborted(hooks.signal);if(!this.runtime)throw new Error("Runtime de agente indisponível.");const resumed=this.runtime.resume(checkpointId);if(!resumed)throw new Error("Checkpoint de aprovação não está disponível.");let state=resumed.state;let previous=this.runtime.getConversationActionContext(hooks.visualContext?.conversationId);
    while(state.nextStep<state.steps.length){this.assertNotAborted(hooks.signal);if(state.iteration>=AGENT_LIMITS.maxIterations||state.results.length>=AGENT_LIMITS.maxToolCalls){const text="O fluxo retomado atingiu o limite seguro de etapas.";this.runtime.finish(resumed.run.id,"FAILED",text);return{text,results:state.results};}
      const step=state.steps[state.nextStep],prepared=this.prepareStep(step,hooks);if("reply"in prepared){this.runtime.finish(resumed.run.id,"FAILED",prepared.reply.text);return{...prepared.reply,results:state.results};}const{tool,data}=prepared;step.input=data;
      if(state.nextStep!==resumed.state.nextStep&&this.needsApproval(tool,false)){const meta=buildConfirmation(step,tool,data);const checkpoint=this.runtime.checkpoint(resumed.run.id,state),approval=this.approvals.create(tool.name,data,tool.risk,meta.consequence??step.explanation??"Ação requer aprovação",{agentRunId:resumed.run.id,checkpointId:checkpoint,...hooks.visualContext},meta);this.runtime.attachApproval(checkpoint,approval.id);const text=confirmationText(tool,meta);hooks.onStatus?.("Aguardando sua confirmação.");hooks.onApprovalRequested?.(approval.id,tool.name);return{text,approvalId:approval.id,results:state.results};}
      this.runtime.recordStep(resumed.run.id,state.nextStep,step,"RUNNING");hooks.onStatus?.(step.explanation??`Retomando ${step.tool}…`);hooks.onToolStarted?.(step.tool,step.explanation??`Retomando ${step.tool}`);const reply=await this.execute(step.tool,data,this.executionContext(hooks));this.assertNotAborted(hooks.signal);hooks.onToolCompleted?.(step.tool,Boolean(reply.result?.ok));this.runtime.recordStep(resumed.run.id,state.nextStep,step,reply.result?.ok?"COMPLETED":"FAILED",reply.result,reply.result?.error);if(!reply.result?.ok){this.runtime.finish(resumed.run.id,"FAILED",reply.text);return{...reply,results:state.results};}
      if(reply.result){const plan:Plan={intent:state.intent,responseMode:state.responseMode};previous=this.planner.observe(previous,state.userRequest,plan,step,reply.result);if(hooks.visualContext?.conversationId)this.runtime.saveConversationActionContext(hooks.visualContext.conversationId,previous);}
      state={...state,nextStep:state.nextStep+1,results:[...state.results,reply.result!],iteration:state.iteration+1};this.runtime.saveState(resumed.run.id,state);
    }
    const text=state.results.at(-1)?.summary??"Ação concluída.";this.runtime.finish(resumed.run.id,"COMPLETED",text);return{text,result:state.results.at(-1),results:state.results};
  }

  async execute(toolName:string,input:Record<string,unknown>,context:ToolExecutionContext={}):Promise<AgentReply>{const tool=this.registry.get(toolName);if(!tool)throw new Error("Ferramenta não encontrada");const startedAt=Date.now();try{const keys=this.resourceKeys(tool,input,context);const result=await(this.resources?this.resources.withResources(keys,()=>tool.execute(input,context)):tool.execute(input,context));this.metrics?.record("tool.duration_ms",Date.now()-startedAt,{tool:tool.name,ok:result.ok});if(!result.ok)this.metrics?.record("tool.failed",1,{tool:tool.name});this.audit.record(tool.name,tool.risk,result.ok?"success":"failed",{input,result});return{text:result.summary,result};}catch(error){const message=error instanceof Error?error.message:String(error);this.metrics?.record("tool.duration_ms",Date.now()-startedAt,{tool:tool.name,ok:false});this.metrics?.record("tool.failed",1,{tool:tool.name});this.audit.record(tool.name,tool.risk,"error",{input,error:message});return{text:`Não consegui concluir a ação: ${message}`,result:{ok:false,summary:"Falha",error:message}};}}

  private prepareStep(step:PlanStep,hooks:AgentRunHooks):{tool:ToolDefinition;data:Record<string,unknown>}|{reply:AgentReply}{const tool=this.registry.get(step.tool);if(!tool)return{reply:{text:`Ferramenta não disponível: ${step.tool}`}};try{this.security?.assertToolEnabled(tool.name);}catch(error){return{reply:{text:error instanceof Error?error.message:String(error)}};}const input={...(step.input??{})};if(!input.connectionId){const capability=tool.permissions.find(permission=>["email.read","email.send","email.modify","calendar.read","calendar.write"].includes(permission))as ConnectionCapability|undefined;if(capability){const resolution=this.connections?.resolveForCapability(capability);if(!resolution||resolution.status==="not_connected")return{reply:{text:"Nenhuma conta Google ou Microsoft está conectada. Abra Conexões e autorize uma conta antes de usar e-mail ou agenda."}};if(resolution.status==="missing_capability")return{reply:{text:`Sua conta ${resolution.account.accountEmail??resolution.account.provider} está conectada, mas a permissão ${this.capabilityLabel(capability)} não está ativa.`}};if(resolution.status==="expired")return{reply:{text:`A autorização da conta ${resolution.account.accountEmail??resolution.account.provider} expirou e não pôde ser renovada automaticamente.`}};if(resolution.status==="needs_reauthorization")return{reply:{text:resolution.account.reauthorizationReason??"A conta precisa ser autorizada novamente."}};input.connectionId=resolution.account.id;}}const parsed=tool.inputSchema.safeParse(input);if(!parsed.success)return{reply:{text:`Não consegui validar os parâmetros de ${tool.name}: ${parsed.error.issues.map(x=>x.message).join(", ")}`}};try{this.security?.assertRecipientDomains((parsed.data as any).to);for(const field of tool.pathFields??[]){const value=(parsed.data as any)[field];if(typeof value==="string")this.permissions.assertPath(value);if(Array.isArray(value))value.forEach(v=>typeof v==="string"&&this.permissions.assertPath(v));}}catch(error){hooks.onStatus?.("A execução foi bloqueada pelas permissões locais.");return{reply:{text:error instanceof Error?error.message:String(error)}};}return{tool,data:parsed.data as Record<string,unknown>};}
  private capabilityLabel(capability:ConnectionCapability){return({"email.read":"para ler e-mails","email.send":"para enviar e-mails","email.modify":"para alterar e-mails","calendar.read":"para ler a agenda","calendar.write":"para alterar a agenda"}as Record<ConnectionCapability,string>)[capability];}
  private needsApproval(tool:ToolDefinition,memory=false){const mutates=tool.mutatesState??tool.risk!=="READ";return mutates||Boolean(this.security?.requiresApproval(tool.name,tool.risk))||memory;}
  private executionContext(hooks:AgentRunHooks):ToolExecutionContext{return{runId:hooks.visualContext?.visualRunId,taskId:hooks.visualContext?.taskId,conversationId:hooks.visualContext?.conversationId,agentId:hooks.visualContext?.agentId,signal:hooks.signal};}
  private resourceKeys(tool:ToolDefinition,input:Record<string,unknown>,context:ToolExecutionContext){const keys:string[]=[];if(tool.name.startsWith("browser_"))keys.push(`browser:${context.runId??"default"}`);if(/^(app_|shell_|desktop_)/.test(tool.name))keys.push("desktop-input");if(tool.mutatesState??tool.risk!=="READ")for(const field of tool.pathFields??[]){const value=input[field];if(typeof value==="string")keys.push(`filesystem:${path.resolve(value).toLowerCase()}`);if(Array.isArray(value))for(const item of value)if(typeof item==="string")keys.push(`filesystem:${path.resolve(item).toLowerCase()}`);}return keys;}
  private assertNotAborted(signal?:AbortSignal){if(signal?.aborted)throw signal.reason??new DOMException("Cancelada pelo usuário.","AbortError");}
  private formatOllamaError(error:unknown,action:string){if(error instanceof OllamaTimeoutError)return`O modelo local ${error.model} demorou mais que o esperado para ${action}. Etapa: ${error.phase}. Limite: ${error.timeoutSeconds} segundos.`;if(error instanceof OllamaConnectionError)return"Não consegui conectar ao Ollama. Verifique se o serviço local está em execução.";if(error instanceof OllamaModelNotFoundError)return error.message;if(error instanceof OllamaInvalidResponseError)return`O Ollama respondeu, mas a resposta não pôde ser interpretada: ${error.message}`;if(error instanceof OllamaUnavailableError)return`A IA local está indisponível: ${error.message}`;return`Não consegui ${action}: ${error instanceof Error?error.message:String(error)}`;}
  private formatResults(done:{step:PlanStep;result:ToolResult}[]){if(!done.length)return"Nenhum resultado.";return done.map(item=>item.result.summary).join("\n");}
}
