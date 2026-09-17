import type { ToolResult,VisualExecutionContext,ClarificationResolutionRequest,ChatPresentation,ConnectionProvider,EmailComposeDraftPatch } from "@nexo/shared";
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
import { ClarificationRepository } from "./clarification/repository.js";
import { ClarificationResolver } from "./clarification/resolver.js";
import { ClarificationService } from "./clarification/service.js";
import type { ClarificationResume,PendingClarification } from "./clarification/types.js";
import { ChatPresentationSession } from "../chat/presentation/session.js";
import { defaultMailboxCategories,mailboxCategoryListLabel,normalizeMailboxCategories } from "../email/preferences/category-resolver.js";
import type { EmailMailboxCategory,EmailMailboxPreferenceCategory } from "../email/preferences/types.js";
import type { EmailComposeDraft } from "../email/compose/types.js";
import { ActionExecutor } from "./execution/action-executor.js";
import type {PreparedAction} from "./execution/types.js";
import type { ExecutionRecordRepository } from "./execution/execution-record-repository.js";
import { AgentLoopRunner } from "./loop/agent-loop-runner.js";
import type {ApprovalCoordinator} from "./approval/approval-coordinator.js";
import {ShadowAgent,type ShadowDecision} from "./loop/shadow-agent.js";
import type {AgentGraph} from "./graph/agent-graph.js";
import {canFallbackToLegacy,executionSafetyState} from "./fallback/agent-fallback-policy.js";
import type {AgentReconciliationCoordinator} from "./execution/reconciliation/agent-reconciliation-coordinator.js";
import {resolveSimpleCoreference} from "./context/conversation-entity-context.js";
import type { AgentResourceContext } from "./goal/goal-types.js";

const EMAIL_DISCOVERY_TOOLS=new Set(["email_search","email_latest","email_stats"]);

export type AgentEngineSource="v2-full"|"v2-read"|"fast-path"|"legacy"|"legacy-fallback";
export type AgentReply={text:string;result?:ToolResult;results?:ToolResult[];approvalId?:string;reviewDraftId?:string;conversationId?:string;presentation?:ChatPresentation;responseMode?:"synthesize"|"deterministic"|"presentation";engine?:AgentEngineSource;fallbackReason?:string;toolsUsed?:string[]};
export type AgentRunHooks={onToolResult?:(toolName:string,input:Record<string,unknown>,result:ToolResult)=>void;onStatus?:(message:string)=>void;onToken?:(token:string)=>void;onReplaceText?:(text:string)=>void;signal?:AbortSignal;onToolStarted?:(toolName:string,label:string)=>void;onToolCompleted?:(toolName:string,ok:boolean)=>void;onApprovalRequested?:(approvalId:string,toolName:string)=>void;visualContext?:VisualExecutionContext;resources?:AgentResourceContext};

export class AgentEngine{
  private readonly toolCatalog:CapabilityAwareToolCatalog;
  private readonly clarifications?:ClarificationService;
  private readonly actionExecutor:ActionExecutor;
  constructor(private planner:AgentPlanner,private registry:ToolRegistry,private permissions:PermissionEngine,private approvals:ApprovalService,private audit:AuditService,private connections?:ConnectionService,private runtime?:AgentRuntime,private security?:SecurityPolicyService,private metrics?:LocalMetricsService,private resources?:ResourceManager,records?:ExecutionRecordRepository,private readonly agentLoopMode:()=>"legacy"|"read_only"|"shadow"|"full"=()=>"legacy",private readonly approvalCoordinator?:ApprovalCoordinator,private readonly agentGraph?:AgentGraph,private readonly legacyFallbackEnabled:()=>boolean=()=>false,private readonly reconciliation?:AgentReconciliationCoordinator){this.toolCatalog=new CapabilityAwareToolCatalog(registry,connections,name=>this.security?.isToolEnabled(name)??true);this.actionExecutor=new ActionExecutor(registry,permissions,audit,{security,metrics,resources,records,connections});if(runtime)this.clarifications=new ClarificationService(new ClarificationRepository(runtime),new ClarificationResolver(permissions));}

  async run(userText:string,hooks:AgentRunHooks={},context:LLMMessage[]=[]):Promise<AgentReply>{
    this.metrics?.record("agent.requests",1,{mode:this.agentLoopMode()});
    const shadowStarted=Date.now(),shadow=this.agentLoopMode()==="shadow"?new ShadowAgent(this.planner.agentProvider(),this.toolCatalog).decide(userText,context.map(message=>({...message,trust:"TRUSTED_LOCAL" as const})),hooks.signal).catch(()=>({kind:"invalid" as const,toolSequence:[] as [],intendedOutcome:"invalid" as const})):undefined;
    const conversationId=hooks.visualContext?.conversationId;
    const previous=this.runtime?.getConversationActionContext(conversationId);
    const resolvedUserText=resolveSimpleCoreference(userText,previous);
    if(conversationId&&this.clarifications){
      const current=this.clarifications.pending(conversationId);
      const preferenceFlow=this.isEmailPreferenceClarification(current);
      let pendingAttempt;
      if(preferenceFlow&&this.runtime){
        pendingAttempt=this.runtime.emailPreferences.transaction(()=>{
          const attempt=this.clarifications!.tryResolveText(conversationId,userText);
          if(attempt.kind==="resolved")this.persistEmailPreference(attempt.value);
          return attempt;
        });
      }else pendingAttempt=this.clarifications.tryResolveText(conversationId,userText);
      if(pendingAttempt.kind==="pending"){
        if(pendingAttempt.pending.status!=="pending"){
          const text=this.isEmailPreferenceClarification(pendingAttempt.pending)?this.emailPreferenceCancellationText(pendingAttempt.pending):pendingAttempt.message??"Esclarecimento cancelado.";
          if(this.isEmailPreferenceClarification(pendingAttempt.pending))this.metrics?.record("email.mailbox_selector.cancelled",1,{provider:String(pendingAttempt.pending.partialEntities.__emailProvider??"unknown")});
          hooks.onReplaceText?.(text);hooks.onStatus?.("Esclarecimento encerrado.");return{text,conversationId};
        }
        return this.clarificationReply(pendingAttempt.pending,hooks,pendingAttempt.message);
      }
      if(pendingAttempt.kind==="resolved"){
        if(this.isEmailPreferenceClarification(pendingAttempt.value.pending)){
          this.recordEmailPreferenceSaved(pendingAttempt.value);
          if(this.emailPreferenceMode(pendingAttempt.value.pending)==="update")return this.emailPreferenceUpdatedReply(pendingAttempt.value,hooks);
        }
        const plan=this.planner.buildIntentPlan(pendingAttempt.value.intent,previous,this.toolCatalog.list());
        const mailboxReply=this.prepareEmailMailboxPlan(pendingAttempt.value.originalRequest,plan,conversationId,hooks);
        if(mailboxReply)return mailboxReply;
        const composeReply=this.prepareEmailComposeReview(plan,conversationId,hooks);if(composeReply)return composeReply;
        return this.executePlan(pendingAttempt.value.originalRequest,plan,hooks,context);
      }
    }

    // Macro browser steps arrive as strict internal tool envelopes. Route these before
    // Agent Loop modes so they stay deterministic while still crossing Core policy.
    if(/^\s*\[\[NEXO_TOOL:(?:browser_download|browser_click|browser_type)\]\]/.test(resolvedUserText)){
      try{const plan=await this.planner.plan(resolvedUserText,context,hooks.signal,previous,this.toolCatalog.list());if(plan.origin==="fast"&&plan.tool)return this.executePlan(resolvedUserText,plan,hooks,context);}
      catch(error){const text=this.formatOllamaError(error,"validar a etapa de navegador");hooks.onReplaceText?.(text);return{text};}
      return{text:"Não consegui validar a etapa de navegador da macro."};
    }

    const pendingMacro=conversationId?this.runtime?.getApplicationState<{name?:string;waitingForDescription?:boolean}>(`macro-draft:${conversationId}`):undefined;
    if(pendingMacro?.waitingForDescription&&pendingMacro.name&&resolvedUserText.trim().length>=8&&!/\b(cancele|cancelar|descarte|descartar)\b/i.test(resolvedUserText)){
      const continuedRequest=`Crie uma macro chamada ${pendingMacro.name} que ${resolvedUserText.trim()}`;
      try{const plan=await this.planner.plan(continuedRequest,context,hooks.signal,previous,this.toolCatalog.list());if(plan.tool==="macro_create_draft")return this.executePlan(continuedRequest,plan,hooks,context);}
      catch(error){const text=this.formatOllamaError(error,"continuar o rascunho da macro");hooks.onReplaceText?.(text);return{text};}
    }

    // Common local commands, macros and ordinary chat avoid constructing an
    // LLM plan. Mutations still go through executePlan and the regular policy.
    const deterministic=this.planner.routeDeterministic(resolvedUserText);
    if(deterministic){
      this.metrics?.record("agent.fast_path_hit",1,{route:deterministic.directStream?"chat":"command"});
      if(deterministic.tool||deterministic.steps?.length)return this.executePlan(resolvedUserText,deterministic,hooks,context);
      if(typeof deterministic.direct==="string"){hooks.onReplaceText?.(deterministic.direct);hooks.onStatus?.("Resposta concluída.");return{text:deterministic.direct,engine:"fast-path"};}
      if(deterministic.directStream){hooks.onStatus?.("A IA local está gerando a resposta…");hooks.onReplaceText?.("");try{const streamed=await this.planner.streamDirectAnswer(userText,token=>hooks.onToken?.(token),context,hooks.signal);hooks.onStatus?.("Resposta concluída.");return{text:streamed,engine:"fast-path"};}catch(error){const text=this.formatOllamaError(error,"gerar a resposta");hooks.onReplaceText?.(text);hooks.onStatus?.("A geração da resposta foi interrompida.");return{text,engine:"fast-path"};}}
    }

    if(this.agentLoopMode()==="read_only")return this.runAgentLoop(resolvedUserText,hooks,context,"read_only");
    if(this.agentLoopMode()==="full"){try{return await this.runAgentLoop(resolvedUserText,hooks,context,"full");}catch(error){const runId=(error as any)?.runId as string|undefined,safety=executionSafetyState(runId?this.runtime?.loadLoopState(runId):undefined),reason=error instanceof Error?error.message:String(error);if(!this.legacyFallbackEnabled()||!canFallbackToLegacy(safety)){this.metrics?.record("agent.v2_controlled_failure",1,{safety});const text="O Agent V2 não conseguiu concluir este pedido com segurança. Nenhuma ação será repetida automaticamente.";return{text,engine:"v2-full",fallbackReason:reason};}this.metrics?.record("agent.legacy_fallback",1,{reason,safety});hooks.onStatus?.("Agent V2 indisponível; usando o modo de compatibilidade seguro.");}}
    let plan:Plan;
    try{hooks.onStatus?.("Interpretando sua intenção com a IA local…");plan=await this.planner.plan(resolvedUserText,context,hooks.signal,previous,this.toolCatalog.list());if(plan.origin==="fast")this.metrics?.record("agent.fast_path_hit",1);if(shadow)this.recordShadow(await shadow,plan,Date.now()-shadowStarted);}
    catch(error){const text=this.formatOllamaError(error,"interpretar este pedido");hooks.onReplaceText?.(text);hooks.onStatus?.("Não foi possível concluir a interpretação.");return{text};}

    if(plan.intent?.status==="needs_clarification"&&conversationId&&this.clarifications){const pending=this.clarifications.create(conversationId,userText,plan.intent);return this.clarificationReply(pending,hooks);}
    const mailboxReply=this.prepareEmailMailboxPlan(userText,plan,conversationId,hooks);if(mailboxReply)return mailboxReply;
    const composeReply=this.prepareEmailComposeReview(plan,conversationId,hooks);if(composeReply)return composeReply;
    if(plan.directStream){hooks.onStatus?.("Conversa identificada. Preparando a IA local…");hooks.onReplaceText?.("");try{hooks.onStatus?.("A IA local está gerando a resposta…");const streamed=await this.planner.streamDirectAnswer(userText,token=>hooks.onToken?.(token),context,hooks.signal);hooks.onStatus?.("Resposta concluída.");return{text:streamed,engine:plan.origin==="fast"?"fast-path":"legacy"};}catch(error){const text=this.formatOllamaError(error,"gerar a resposta");hooks.onReplaceText?.(text);hooks.onStatus?.("A geração da resposta foi interrompida.");return{text,engine:plan.origin==="fast"?"fast-path":"legacy"};}}
    if(typeof plan.direct==="string"){hooks.onReplaceText?.(plan.direct);hooks.onStatus?.("Resposta concluída.");return{text:plan.direct,engine:plan.origin==="fast"?"fast-path":"legacy"};}
    return this.executePlan(userText, plan, hooks, context);
  }

  async resolveClarification(request:ClarificationResolutionRequest,hooks:AgentRunHooks={},context:LLMMessage[]=[]):Promise<AgentReply>{
    if(!this.clarifications)throw new Error("Serviço de esclarecimento indisponível.");
    const existing=this.clarifications.get(request.clarificationId);if(!existing)throw new Error("Esclarecimento não encontrado.");
    const session=new ChatPresentationSession();
    const capturedHooks:AgentRunHooks={...hooks,onToolResult:(name,input,result)=>{session.add(name,input,result);hooks.onToolResult?.(name,input,result);}};
    let attempt;
    if(this.isEmailPreferenceClarification(existing)&&this.runtime){attempt=this.runtime.emailPreferences.transaction(()=>{const resolved=this.clarifications!.resolve(request);if(resolved.kind==="resolved")this.persistEmailPreference(resolved.value);return resolved;});}
    else attempt=this.clarifications.resolve(request);
    if(attempt.kind==="none")throw new Error("Esse esclarecimento não está mais pendente.");
    let reply:AgentReply;
    if(attempt.kind==="pending")reply=await this.clarificationReply(attempt.pending,capturedHooks,attempt.message);
    else if(this.isEmailPreferenceClarification(attempt.value.pending)&&this.emailPreferenceMode(attempt.value.pending)==="update"){
      this.recordEmailPreferenceSaved(attempt.value);reply=this.emailPreferenceUpdatedReply(attempt.value,capturedHooks);
    }else{
      if(this.isEmailPreferenceClarification(attempt.value.pending))this.recordEmailPreferenceSaved(attempt.value);
      const previous=this.runtime?.getConversationActionContext(existing.conversationId),plan=this.planner.buildIntentPlan(attempt.value.intent,previous,this.toolCatalog.list());
      const mailboxReply=this.prepareEmailMailboxPlan(attempt.value.originalRequest,plan,existing.conversationId,capturedHooks);
      const composeReply=this.prepareEmailComposeReview(plan,existing.conversationId,capturedHooks);
      reply=mailboxReply??composeReply??await this.executePlan(attempt.value.originalRequest,plan,capturedHooks,context);
    }
    const approval=reply.approvalId?this.approvals.list().find(item=>item.id===reply.approvalId):undefined;
    const presentation=session.finish(reply.text,approval)?.presentation;
    return{...reply,conversationId:existing.conversationId,presentation};
  }

  getPendingClarification(conversationId:string){const pending=this.clarifications?.pending(conversationId);return pending?this.clarifications?.block(pending):undefined;}
  cancelClarification(id:string){const existing=this.clarifications?.get(id);const cancelled=this.clarifications?.cancel(id);if(!cancelled||!existing)return undefined;if(this.isEmailPreferenceClarification(existing)){this.metrics?.record("email.mailbox_selector.cancelled",1,{provider:String(existing.partialEntities.__emailProvider??"unknown")});return{conversationId:existing.conversationId,block:this.clarifications?.block(cancelled),text:this.emailPreferenceCancellationText(existing)};}return{conversationId:existing.conversationId,block:this.clarifications?.block(cancelled)};}

  getEmailDraft(draftId:string){return this.requireEmailDrafts().getRequired(draftId);}
  updateEmailDraft(draftId:string,expectedVersion:number,patch:EmailComposeDraftPatch){return this.requireEmailDrafts().update(draftId,expectedVersion,patch);}
  cancelEmailDraft(draftId:string,expectedVersion:number){return this.requireEmailDrafts().cancel(draftId,expectedVersion);}
  async submitEmailDraft(draftId:string,expectedVersion:number,hooks:AgentRunHooks={}):Promise<EmailComposeDraft>{
    const drafts=this.requireEmailDrafts(),draft=drafts.getRequired(draftId);
    const effectiveHooks:AgentRunHooks={...hooks,visualContext:hooks.visualContext??{visualRunId:`email-draft:${draft.id}`,taskId:draft.taskId,conversationId:draft.conversationId,agentId:"email-compose"}};
    return drafts.submit(draftId,expectedVersion,async frozen=>{
      if(!this.runtime)throw new Error("Runtime de agente indisponível.");
      const step:PlanStep={tool:"email_send_composed",input:{...(frozen.connectionId?{connectionId:frozen.connectionId}:{}),to:frozen.to.map(email=>({email})),subject:frozen.subject,bodyText:frozen.bodyText},explanation:"Enviando o e-mail revisado…",approval:{domain:"email",actionType:"send",preview:`Para: ${frozen.to.join(", ")}\nAssunto: ${frozen.subject||"Sem assunto"}\n\n${frozen.bodyText}`,affectedCount:frozen.to.length,consequence:"O e-mail será enviado em seu nome.",expiresInMs:10*60_000}};
      const prepared=await this.preflightStep(step,effectiveHooks);if("reply" in prepared)throw new Error(prepared.reply.text);const{tool,data,action}=prepared;step.input=data;step.executionId=action.executionId;
      const userRequest="Enviar e-mail revisado";
      const run=this.runtime.start(userRequest,[step],{conversationId:frozen.conversationId,taskId:frozen.taskId,agentId:effectiveHooks.visualContext?.agentId},{responseMode:"deterministic"});
      const state={userRequest,steps:[step],nextStep:0,results:[],iteration:0,responseMode:"deterministic" as const};
      const checkpointId=this.runtime.checkpoint(run.id,state);
      const meta=buildConfirmation(step,tool,data);
      const approval=this.approvals.create(tool.name,data,tool.risk,meta.consequence??"O e-mail será enviado em seu nome.",{agentRunId:run.id,checkpointId,executionId:step.executionId,...effectiveHooks.visualContext},meta);
      this.runtime.attachApproval(checkpointId,approval.id);
      this.audit.record(tool.name,tool.risk,"awaiting_approval",{recipientCount:frozen.to.length,draftId:frozen.id,version:frozen.version});
      this.approvals.resolve(approval.id,true);
      const reply=await this.resumeApproval(checkpointId,effectiveHooks);
       if(!reply.result?.ok)throw new Error(toolErrorMessage(reply.result?.error)??reply.text);
      return{approvalId:approval.id};
    });
  }

  /** Core action registry entry point. Uses the same policy, checkpoints and approvals as chat. */
  async runPlan(userText: string, steps: PlanStep[], hooks: AgentRunHooks = {}): Promise<AgentReply> {return this.executePlan(userText, { steps: structuredClone(steps) }, hooks, []);}

  private requireEmailDrafts(){if(!this.runtime)throw new Error("Serviço de rascunho de e-mail indisponível.");return this.runtime.emailDrafts;}
  private prepareEmailComposeReview(plan:Plan,conversationId:string|undefined,hooks:AgentRunHooks):AgentReply|undefined{
    if(!plan.emailDraft)return undefined;
    if(!conversationId||!this.runtime){const text="Abra o envio em um chat para revisar o e-mail antes de enviá-lo.";hooks.onReplaceText?.(text);return{text};}
    const draft=this.runtime.emailDrafts.create({conversationId,taskId:hooks.visualContext?.taskId,...plan.emailDraft});
    const block=this.runtime.emailDrafts.block(draft),text="Revise o e-mail antes de enviar.",result:ToolResult={success:true,ok:true,summary:text,data:block};
    hooks.onToolResult?.("__email_compose_review__",{},result);hooks.onReplaceText?.(text);hooks.onStatus?.("Aguardando revisão do e-mail.");
    return{text,result,conversationId,reviewDraftId:draft.id,responseMode:"presentation"};
  }

  private async clarificationReply(pending:PendingClarification,hooks:AgentRunHooks,message?:string):Promise<AgentReply>{
    if(!this.clarifications)return{text:message??pending.questions[0]?.prompt??"Preciso de mais informações."};
    const block=this.clarifications.block(pending),text=message??block.title,result:ToolResult={success:true,ok:true,summary:text,data:block};
    hooks.onToolResult?.("__clarification__",{},result);hooks.onReplaceText?.(text);hooks.onStatus?.("Aguardando resposta.");return{text,result,conversationId:pending.conversationId};
  }

  private prepareEmailMailboxPlan(userText:string,plan:Plan,conversationId:string|undefined,hooks:AgentRunHooks):AgentReply|undefined{
    if(!plan.uiFlow&&!this.emailDiscoverySteps(plan).length)return undefined;
    const resolved=this.resolveEmailReadAccount(this.firstEmailInput(plan));
    if(resolved.error){hooks.onReplaceText?.(resolved.error);return{text:resolved.error};}
    const account=resolved.account;if(!account)return undefined;
    if(plan.uiFlow==="email_mailbox_preferences"){
      if(!conversationId||!this.clarifications){const text="Abra esta solicitação em um chat para selecionar as caixas de e-mail.";hooks.onReplaceText?.(text);return{text};}
      const stored=this.runtime?.emailPreferences.get(account.id),selected=normalizeMailboxCategories(account.provider,stored?.categories);
      const pending=this.clarifications.createEmailMailboxPreference(conversationId,userText,plan.intent!,account.id,account.provider,selected.length?selected:defaultMailboxCategories(account.provider),"update");
      this.metrics?.record("email.mailbox_selector.shown",1,{provider:account.provider,mode:"update"});return this.clarificationReplySync(pending,hooks);
    }
    const explicit=this.explicitEmailCategories(plan);
    if(explicit.length){if(account.provider!=="google"){const text="As categorias Principal, Promoções, Social, Atualizações e Fóruns são específicas do Gmail. Para a conta Microsoft, o Nexo pesquisa a Caixa de entrada.";hooks.onReplaceText?.(text);return{text};}this.applyCategoriesToPlan(plan,account.id,explicit);this.metrics?.record("email.search.categories_count",explicit.length,{provider:account.provider,source:"explicit"});return undefined;}
    const stored=this.runtime?.emailPreferences.get(account.id),categories=normalizeMailboxCategories(account.provider,stored?.categories);
    if(categories.length){this.applyCategoriesToPlan(plan,account.id,categories);this.metrics?.record("email.search.categories_count",categories.length,{provider:account.provider,source:"preference"});return undefined;}
    if(!conversationId||!this.clarifications){const text="Antes de pesquisar seus e-mails, escolha no chat quais caixas devem ser consideradas por padrão.";hooks.onReplaceText?.(text);return{text};}
    if(!plan.intent)return undefined;
    const selected=defaultMailboxCategories(account.provider),pending=this.clarifications.createEmailMailboxPreference(conversationId,userText,plan.intent,account.id,account.provider,selected,"initial");
    this.metrics?.record("email.mailbox_selector.shown",1,{provider:account.provider,mode:"initial"});return this.clarificationReplySync(pending,hooks);
  }

  private clarificationReplySync(pending:PendingClarification,hooks:AgentRunHooks):AgentReply{if(!this.clarifications)return{text:pending.questions[0]?.prompt??"Preciso de mais informações."};const block=this.clarifications.block(pending),text=block.title,result:ToolResult={success:true,ok:true,summary:text,data:block};hooks.onToolResult?.("__clarification__",{},result);hooks.onReplaceText?.(text);hooks.onStatus?.("Aguardando resposta.");return{text,result,conversationId:pending.conversationId};}
  private emailDiscoverySteps(plan:Plan){return(plan.steps??(plan.tool?[{tool:plan.tool,input:plan.input??{}}]:[])).filter(step=>EMAIL_DISCOVERY_TOOLS.has(step.tool));}
  private firstEmailInput(plan:Plan){return this.emailDiscoverySteps(plan)[0]?.input??{};}
  private resolveEmailReadAccount(input:Record<string,unknown>){
    if(!this.connections)return{account:undefined as ReturnType<ConnectionService["get"]>|undefined};
    if(typeof input.connectionId==="string"){const account=this.connections.get(input.connectionId);if(account)return{account};}
    const resolution=this.connections.resolveForCapability("email.read");
    if(resolution.status==="ready")return{account:resolution.account};
    if(resolution.status==="not_connected")return{error:"Nenhuma conta Google ou Microsoft está conectada. Abra Conexões e autorize uma conta antes de usar e-mail."};
    if(resolution.status==="missing_capability")return{error:`Sua conta ${resolution.account.accountEmail??resolution.account.provider} está conectada, mas a permissão para ler e-mails não está ativa.`};
    if(resolution.status==="expired")return{error:`A autorização da conta ${resolution.account.accountEmail??resolution.account.provider} expirou e não pôde ser renovada automaticamente.`};
    return{error:resolution.account.reauthorizationReason??"A conta precisa ser autorizada novamente."};
  }
  private explicitEmailCategories(plan:Plan):EmailMailboxCategory[]{const raw=(plan.intent?.entities as Record<string,unknown>|undefined)?.categories;if(!Array.isArray(raw))return[];const allowed=new Set<EmailMailboxCategory>(["primary","promotions","social","updates","forums"]);return[...new Set(raw.filter((value):value is EmailMailboxCategory=>typeof value==="string"&&allowed.has(value as EmailMailboxCategory)))];}
  private applyCategoriesToPlan(plan:Plan,connectionId:string,categories:EmailMailboxPreferenceCategory[]){for(const step of this.emailDiscoverySteps(plan)){step.input.connectionId=connectionId;if(categories[0]!=="inbox")step.input.categories=categories;else delete step.input.categories;}if(plan.tool&&EMAIL_DISCOVERY_TOOLS.has(plan.tool)){plan.input={...(plan.input??{}),connectionId};if(categories[0]!=="inbox")plan.input.categories=categories;else delete plan.input.categories;}}
  private isEmailPreferenceClarification(pending?:PendingClarification){return Boolean(pending?.domain==="email"&&pending.partialEntities.__emailPreferenceFlow===true);}
  private emailPreferenceMode(pending:PendingClarification){return pending.partialEntities.__emailPreferenceMode==="update"?"update":"initial";}
  private persistEmailPreference(value:ClarificationResume){if(!this.runtime||!this.isEmailPreferenceClarification(value.pending))return;const connectionId=String(value.pending.partialEntities.connectionId??""),provider=String(value.pending.partialEntities.__emailProvider??"") as ConnectionProvider,raw=value.resolution.values.emailCategories,categories=normalizeMailboxCategories(provider,raw);if(!connectionId||!categories.length)throw new Error("Selecione pelo menos uma caixa.");this.runtime.emailPreferences.save(connectionId,categories);this.audit.record("email.preferences.updated","WRITE","success",{connectionId,categoryCount:categories.length,categories});}
  private recordEmailPreferenceSaved(value:ClarificationResume){const provider=String(value.pending.partialEntities.__emailProvider??"unknown"),mode=this.emailPreferenceMode(value.pending),raw=value.resolution.values.emailCategories,count=Array.isArray(raw)?raw.length:0;this.metrics?.record(mode==="initial"?"email.mailbox_selector.saved":"email.mailbox_preference.updated",1,{provider,categoryCount:count});}
  private emailPreferenceUpdatedReply(value:ClarificationResume,hooks:AgentRunHooks):AgentReply{const raw=value.resolution.values.emailCategories,categories=normalizeMailboxCategories(String(value.pending.partialEntities.__emailProvider??"") as ConnectionProvider,raw),text=`Preferência atualizada.\n\nAs próximas consultas considerarão: ${mailboxCategoryListLabel(categories)}.`;hooks.onReplaceText?.(text);hooks.onStatus?.("Preferência atualizada.");return{text,conversationId:value.pending.conversationId};}
  private emailPreferenceCancellationText(pending:PendingClarification){return this.emailPreferenceMode(pending)==="update"?"Alteração cancelada. A preferência anterior foi mantida.":'A consulta de e-mails foi cancelada.\nVocê pode definir as caixas quando quiser dizendo "selecionar caixas de e-mails".';}

  private async executePlan(userText: string, plan: Plan, hooks: AgentRunHooks, context: LLMMessage[]): Promise<AgentReply> {
    const conversationId = hooks.visualContext?.conversationId,previous = this.runtime?.getConversationActionContext(conversationId);
    const steps:PlanStep[]=plan.steps??(plan.tool?[{tool:plan.tool,input:plan.input??{},explanation:plan.explanation}]:[]);
    if(!steps.length){const text="Não identifiquei uma ação segura para executar.";hooks.onReplaceText?.(text);return{text};}
    if(steps.length>AGENT_LIMITS.maxToolCalls){const text="O plano excedeu o limite seguro de etapas.";hooks.onReplaceText?.(text);return{text};}
    hooks.onStatus?.("Plano validado pelo Core. Preparando execução…");
    const persistedRun=this.runtime?.start(userText,steps,{conversationId,taskId:hooks.visualContext?.taskId,agentId:hooks.visualContext?.agentId},{intent:plan.intent,deferredAction:plan.deferredAction,responseMode:plan.responseMode});
    const done:{step:PlanStep;result:ToolResult}[]=[];let previousContext=previous,deferredConsumed=false,modelFinalResponse:string|undefined;
    for(let stepIndex=0;stepIndex<steps.length;stepIndex++){
      const step=steps[stepIndex];this.assertNotAborted(hooks.signal);
      if(stepIndex>=AGENT_LIMITS.maxIterations){const text="O agente atingiu o limite seguro de iterações.";hooks.onReplaceText?.(text);if(persistedRun)this.runtime?.finish(persistedRun.id,"FAILED",text);return{text,results:done.map(x=>x.result)};}
      hooks.onStatus?.(step.explanation??`Executando ${step.tool}…`);hooks.onToolStarted?.(step.tool,step.explanation??`Executando ${step.tool}`);if(persistedRun)this.runtime?.recordStep(persistedRun.id,stepIndex,step,"RUNNING");
      const prepared=await this.preflightStep(step,hooks);if("reply"in prepared)return prepared.reply;const{tool,data,action}=prepared;step.input=data;step.executionId=action.executionId;
      const needsMemoryApproval=step.tool==="memory_save"&&plan.origin==="llm"&&this.permissions.requiresAutomaticMemoryApproval();
      if(this.needsApproval(tool,needsMemoryApproval)){
        const meta=buildConfirmation(step,tool,data),reason=needsMemoryApproval?"A IA identificou uma memória para salvar e sua configuração exige confirmação.":meta.consequence??step.explanation??"Ação requer aprovação";
        const checkpointState={userRequest:userText,steps,nextStep:stepIndex,results:done.map(x=>x.result),iteration:stepIndex,intent:plan.intent,deferredAction:deferredConsumed?undefined:plan.deferredAction,responseMode:plan.responseMode};
        const checkpointId=persistedRun&&this.runtime?this.runtime.checkpoint(persistedRun.id,checkpointState):undefined;
        const approval=this.approvals.create(tool.name,data,tool.risk,reason,checkpointId&&persistedRun?{agentRunId:persistedRun.id,checkpointId,executionId:step.executionId,...hooks.visualContext}:undefined,meta);
        if(checkpointId)this.runtime?.attachApproval(checkpointId,approval.id);this.audit.record(tool.name,tool.risk,"awaiting_approval",{input:data,affectedCount:meta.affectedCount});
        const text=confirmationText(tool,meta);hooks.onReplaceText?.(text);hooks.onStatus?.("Aguardando sua confirmação.");hooks.onApprovalRequested?.(approval.id,tool.name);return{text,approvalId:approval.id,results:done.map(x=>x.result)};
      }
       const reply=await this.execute(tool.name,data,{...this.executionContext(hooks),executionId:step.executionId});hooks.onToolCompleted?.(tool.name,Boolean(reply.result?.ok));if(persistedRun)this.runtime?.recordStep(persistedRun.id,stepIndex,step,reply.result?.ok?"COMPLETED":"FAILED",reply.result,toolErrorMessage(reply.result?.error));
      if(reply.result){hooks.onToolResult?.(tool.name,data,reply.result);done.push({step,result:reply.result});previousContext=this.planner.observe(previousContext,userText,plan,step,reply.result);if(conversationId)this.runtime?.saveConversationActionContext(conversationId,previousContext);}
      if(reply.result&&!reply.result.ok){hooks.onReplaceText?.(reply.text);hooks.onStatus?.("A ferramenta retornou uma falha.");return{text:reply.text,result:reply.result,results:done.map(x=>x.result)};}
      hooks.onStatus?.(`${tool.description}: concluído.`);
      if(plan.deferredAction&&!deferredConsumed&&reply.result){const materialized=this.planner.materialize(plan,reply.result);deferredConsumed=true;if(materialized?.direct){hooks.onReplaceText?.(materialized.direct);hooks.onStatus?.("Prévia concluída sem alterações.");if(persistedRun)this.runtime?.finish(persistedRun.id,"COMPLETED",materialized.direct);return{text:materialized.direct,result:reply.result,results:done.map(x=>x.result)};}if(materialized?.step){if(data.connectionId&&/^(email|calendar)_/.test(materialized.step.tool))materialized.step.input.connectionId=data.connectionId;if(steps.length>=AGENT_LIMITS.maxToolCalls){const text="A ação exigiria etapas demais para o limite seguro.";return{text,results:done.map(x=>x.result)};}steps.push(materialized.step);}}
      if(!plan.intent&&plan.origin==="llm"&&stepIndex===steps.length-1&&done.length<AGENT_LIMITS.maxToolCalls){try{const next=await this.planner.decideNext(userText,done.map(x=>x.result),context);if(typeof next.direct==="string"&&next.direct.trim())modelFinalResponse=next.direct;else if(next.tool)steps.push({tool:next.tool,input:next.input??{},explanation:next.explanation});}catch{}}
      if(persistedRun)this.runtime?.saveState(persistedRun.id,{userRequest:userText,steps,nextStep:stepIndex+1,results:done.map(x=>x.result),iteration:stepIndex+1,intent:plan.intent,deferredAction:deferredConsumed?undefined:plan.deferredAction,responseMode:plan.responseMode});if(modelFinalResponse)break;
    }
    const fallback=modelFinalResponse?{text:modelFinalResponse,results:done.map(x=>x.result)}:done.length===1?{text:done[0].result.summary,result:done[0].result}:{text:this.formatResults(done),results:done.map(x=>x.result)};let finalReply:AgentReply=fallback;
    if(plan.responseMode==="synthesize"&&done.length>0){try{hooks.onStatus?.("Sintetizando os resultados com a IA local…");finalReply={...fallback,text:await this.planner.synthesize(userText,done.map(x=>x.result),hooks.signal)};}catch{}}
    hooks.onReplaceText?.(finalReply.text);hooks.onStatus?.("Tarefa concluída.");this.metrics?.record("agent.tool_calls",done.length,{origin:plan.origin??"unknown"});this.metrics?.record("agent.iterations",steps.length,{origin:plan.origin??"unknown"});if(persistedRun)this.runtime?.finish(persistedRun.id,"COMPLETED",finalReply.text);return {...finalReply,responseMode:plan.responseMode,engine:plan.origin==="fast"?"fast-path":"legacy",toolsUsed:done.map(item=>item.step.tool)};
  }

  async resumeApproval(checkpointId:string,hooks:AgentRunHooks={}):Promise<AgentReply>{
    this.assertNotAborted(hooks.signal);if(!this.runtime)throw new Error("Runtime de agente indisponível.");const loopState=this.runtime.loadLoopState(checkpointId);if(loopState?.status==="WAITING_APPROVAL"){if(!this.approvalCoordinator)throw new Error("ApprovalCoordinator V2 indisponível.");const approval=this.approvals.list("all").find(item=>item.checkpointId===checkpointId&&item.status==="approved");if(!approval)throw new Error("Approval V2 aprovada não encontrada.");const runner=new AgentLoopRunner(this.planner.agentProvider(),this.toolCatalog,this.registry,this.actionExecutor,this.connections,this.runtime,undefined,this.agentGraph,undefined,this.reconciliation);const completed=await runner.resumeApproved(loopState,approval.id,this.approvalCoordinator,hooks.signal);return this.handleLoopState(completed,hooks);}this.approvals.assertCheckpointApproved(checkpointId);const resumed=this.runtime.resume(checkpointId);if(!resumed)throw new Error("Checkpoint de aprovação não está disponível.");let state=resumed.state;let previous=this.runtime.getConversationActionContext(hooks.visualContext?.conversationId);
    while(state.nextStep<state.steps.length){this.assertNotAborted(hooks.signal);if(state.iteration>=AGENT_LIMITS.maxIterations||state.results.length>=AGENT_LIMITS.maxToolCalls){const text="O fluxo retomado atingiu o limite seguro de etapas.";this.runtime.finish(resumed.run.id,"FAILED",text);return{text,results:state.results};}
      const step=state.steps[state.nextStep],prepared=await this.preflightStep(step,hooks);if("reply"in prepared){this.runtime.finish(resumed.run.id,"FAILED",prepared.reply.text);return{...prepared.reply,results:state.results};}const{tool,data,action}=prepared;step.input=data;step.executionId=action.executionId;
      if(state.nextStep!==resumed.state.nextStep&&this.needsApproval(tool,false)){const meta=buildConfirmation(step,tool,data),checkpoint=this.runtime.checkpoint(resumed.run.id,state),approval=this.approvals.create(tool.name,data,tool.risk,meta.consequence??step.explanation??"Ação requer aprovação",{agentRunId:resumed.run.id,checkpointId:checkpoint,executionId:step.executionId,...hooks.visualContext},meta);this.runtime.attachApproval(checkpoint,approval.id);const text=confirmationText(tool,meta);hooks.onStatus?.("Aguardando sua confirmação.");hooks.onApprovalRequested?.(approval.id,tool.name);return{text,approvalId:approval.id,results:state.results};}
       this.runtime.recordStep(resumed.run.id,state.nextStep,step,"RUNNING");hooks.onStatus?.(step.explanation??`Retomando ${step.tool}…`);hooks.onToolStarted?.(step.tool,step.explanation??`Retomando ${step.tool}`);const approved=this.approvals.list("all").find(item=>item.checkpointId===checkpointId&&item.status==="approved");const reply=await this.execute(step.tool,data,{...this.executionContext(hooks),executionId:step.executionId,approvalId:approved?.id});this.assertNotAborted(hooks.signal);hooks.onToolCompleted?.(step.tool,Boolean(reply.result?.ok));this.runtime.recordStep(resumed.run.id,state.nextStep,step,reply.result?.ok?"COMPLETED":"FAILED",reply.result,toolErrorMessage(reply.result?.error));if(!reply.result?.ok){this.runtime.finish(resumed.run.id,"FAILED",reply.text);return{...reply,results:state.results};}
      if(reply.result){hooks.onToolResult?.(step.tool,data,reply.result);const plan:Plan={intent:state.intent,responseMode:state.responseMode};previous=this.planner.observe(previous,state.userRequest,plan,step,reply.result);if(hooks.visualContext?.conversationId)this.runtime.saveConversationActionContext(hooks.visualContext.conversationId,previous);}
      state={...state,nextStep:state.nextStep+1,results:[...state.results,reply.result!],iteration:state.iteration+1};this.runtime.saveState(resumed.run.id,state);
    }
    const text=state.results.at(-1)?.summary??"Ação concluída.";this.runtime.finish(resumed.run.id,"COMPLETED",text);return{text,result:state.results.at(-1),results:state.results};
  }

  async execute(toolName:string,input:Record<string,unknown>,context:ToolExecutionContext={}):Promise<AgentReply>{const actionContext={...context,...(!this.connections?{capabilityResolver:()=>true}:{})};const preflight=await this.actionExecutor.preflight(toolName,input,actionContext);if(!preflight.ok)return{text:`Não consegui concluir a ação: ${preflight.message}`,result:toolFailure(preflight.code,preflight.message)};let dispatchAuthorized=context.dispatchAuthorized;if(preflight.action.requiresApproval&&preflight.action.mutatesState&&!dispatchAuthorized){if(!context.approvalId)return{text:"Não consegui concluir a ação: mutation exige aprovação válida.",result:toolFailure("APPROVAL_REQUIRED","A mutation exige aprovação válida.")};if(this.approvalCoordinator)this.approvalCoordinator.consumeApproved(context.approvalId,{callId:`direct:${preflight.action.executionId}`,executionId:preflight.action.executionId,toolName:preflight.action.toolName,input:preflight.action.input,fingerprint:preflight.action.fingerprint,idempotencyKey:preflight.action.idempotencyKey,iteration:0,mutatesState:true,risk:preflight.action.risk,requiresApproval:preflight.action.requiresApproval});else{const approval=this.approvals.list("all").find(item=>item.id===context.approvalId);if(!approval||approval.status!=="approved"||approval.toolName!==preflight.action.toolName||approval.fingerprint!==preflight.action.fingerprint)return{text:"Não consegui concluir a ação: approval não corresponde à mutation.",result:toolFailure("APPROVAL_MISMATCH","A aprovação não corresponde à mutation.")};}dispatchAuthorized=true;}const execution=await this.actionExecutor.executePrepared(preflight.action,{...actionContext,dispatchAuthorized});if(execution.result)return{text:execution.result.summary,result:execution.result};const message=execution.error??"O resultado da ação é desconhecido e requer reconciliação.";return{text:`Não consegui concluir a ação: ${message}`,result:toolFailure("ACTION_FAILED",message)};}

  async recoverInterruptedLoops(){if(!this.runtime)return[];const recovered:AgentReply[]=[];for(const state of this.runtime.recoverableLoops()){if(state.status!=="DECIDING")continue;try{const runner=new AgentLoopRunner(this.planner.agentProvider(),this.toolCatalog,this.registry,this.actionExecutor,this.connections,this.runtime,undefined,this.agentGraph,this.metrics,this.reconciliation);recovered.push(this.handleLoopState(await runner.createLoopForRecovery(state),{}));}catch(error){this.metrics?.record("agent.recovery_failed",1,{runId:state.runId,error:error instanceof Error?error.message:String(error)});}}return recovered;}

  async rejectLoopApproval(runId:string,approvalId:string,hooks:AgentRunHooks={}):Promise<AgentReply>{if(!this.runtime)throw new Error("Runtime de agente indisponível.");const state=this.runtime.loadLoopState(runId);if(!state)throw new Error("Run V2 não encontrado.");const runner=new AgentLoopRunner(this.planner.agentProvider(),this.toolCatalog,this.registry,this.actionExecutor,this.connections,this.runtime,undefined,this.agentGraph,this.metrics,this.reconciliation);return this.loopReply(await runner.reject(state,approvalId),hooks);}
  private async runAgentLoop(userText:string,hooks:AgentRunHooks,context:LLMMessage[],mode:"read_only"|"full"):Promise<AgentReply>{const runner=new AgentLoopRunner(this.planner.agentProvider(),this.toolCatalog,this.registry,this.actionExecutor,this.connections,this.runtime,undefined,this.agentGraph,this.metrics,this.reconciliation);const state=await runner.run(userText,{mode,conversationId:hooks.visualContext?.conversationId,taskId:hooks.visualContext?.taskId,messages:context.map(message=>({...message,trust:"TRUSTED_LOCAL" as const})),resources:hooks.resources,signal:hooks.signal});return{...this.handleLoopState(state,hooks),engine:mode==="full"?"v2-full":"v2-read",toolsUsed:state.observations.map(item=>item.toolName)};}
  private handleLoopState(state:import("./loop/types.js").AgentLoopState,hooks:AgentRunHooks):AgentReply{if(state.status==="WAITING_APPROVAL"&&state.pendingAction){const tool=this.registry.get(state.pendingAction.toolName);if(!tool)throw new Error("Ferramenta pendente deixou de existir.");const existing=state.pendingAction.approvalId?this.approvals.list("all").find(item=>item.id===state.pendingAction!.approvalId):undefined;const approval=existing??this.approvals.create(tool.name,state.pendingAction.input,tool.risk,"A ação proposta pelo agente altera estado e requer sua confirmação.",{agentRunId:state.runId,checkpointId:state.runId,executionId:state.pendingAction.executionId,...hooks.visualContext});state.pendingAction.approvalId=approval.id;this.runtime?.saveLoopState(state.runId,state);hooks.onApprovalRequested?.(approval.id,tool.name);return{text:`Confirme a execução de ${tool.description}.`,approvalId:approval.id,results:state.observations.map(item=>({success:item.ok,ok:item.ok,summary:item.summary,data:item.data}))};}return this.loopReply(state,hooks);}
  private loopReply(state:import("./loop/types.js").AgentLoopState,hooks:AgentRunHooks):AgentReply{for(const observation of state.observations)hooks.onToolResult?.(observation.toolName,{}, {success:observation.ok,ok:observation.ok,summary:observation.summary,data:observation.data});const text=state.finalResponse??(state.status==="RESULT_UNKNOWN"?"A execução pode ter ocorrido. Não repita esta mutação; é necessária reconciliação.":"O Agent Loop não conseguiu concluir a tarefa.");hooks.onReplaceText?.(text);return{text,results:state.observations.map(observation=>({success:observation.ok,ok:observation.ok,summary:observation.summary,data:observation.data}))};}
  private recordShadow(shadow:ShadowDecision,plan:Plan,latencyMs:number){const legacySequence=plan.steps?.map(step=>step.tool)??(plan.tool?[plan.tool]:[]),v2Sequence=shadow.toolSequence,legacy=legacySequence[0]??(plan.direct||plan.directStream?"final":"none"),v2=v2Sequence[0]??shadow.kind,firstMatch=legacy===v2,sequenceMatch=JSON.stringify(legacySequence)===JSON.stringify(v2Sequence),finalIntent=plan.intent?.operation??plan.intent?.intent??"unknown";this.metrics?.record(firstMatch?"shadow.first_tool_match":"shadow.target_mismatch",1,{legacy_plan:legacy,v2_first_tool:v2});this.metrics?.record("shadow.sequence_match",sequenceMatch?1:0,{legacy_sequence:legacySequence.join("→")||"final",v2_sequence:v2Sequence.join("→")||shadow.kind});this.metrics?.record("shadow.extra_tools",Math.max(0,v2Sequence.length-legacySequence.length));this.metrics?.record("shadow.missed_tools",Math.max(0,legacySequence.length-v2Sequence.length));this.metrics?.record("agent.shadow.latency_ms",latencyMs,{v2_first_tool:v2});this.metrics?.record("agent.shadow.tool_count",v2Sequence.length,{outcome:shadow.intendedOutcome,legacy_outcome:finalIntent});if(shadow.kind==="tool"&&shadow.mutatesState)this.metrics?.record("agent.shadow.unexpected_mutation",1,{tool:shadow.toolName});}

  private async preflightStep(step:PlanStep,hooks:AgentRunHooks):Promise<{tool:ToolDefinition;data:Record<string,unknown>;action:PreparedAction}|{reply:AgentReply}>{const result=await this.actionExecutor.preflight(step.tool,step.input,{...this.executionContext(hooks),executionId:step.executionId,...(!this.connections?{capabilityResolver:()=>true}:{})});if(!result.ok){if(result.code==="PATH_DENIED"||result.code==="CAPABILITY_DENIED"||result.code==="SECURITY_DENIED")hooks.onStatus?.("A execução foi bloqueada pelas permissões locais.");return{reply:{text:`Não consegui concluir a ação: ${result.message}`}};}const tool=this.registry.get(result.action.toolName);if(!tool)return{reply:{text:`Ferramenta não disponível: ${result.action.toolName}`}};return{tool,data:result.action.input,action:result.action};}
  private needsApproval(tool:ToolDefinition,memory=false){const mutates=tool.mutatesState??tool.risk!=="READ";return this.permissions.requiresApproval(tool.risk,mutates)||Boolean(this.security?.requiresApproval(tool.name,tool.risk))||memory;}
  private executionContext(hooks:AgentRunHooks):ToolExecutionContext{return{runId:hooks.visualContext?.visualRunId,taskId:hooks.visualContext?.taskId,conversationId:hooks.visualContext?.conversationId,agentId:hooks.visualContext?.agentId,signal:hooks.signal};}
  private assertNotAborted(signal?:AbortSignal){if(signal?.aborted)throw signal.reason??new DOMException("Cancelada pelo usuário.","AbortError");}
  private formatOllamaError(error:unknown,action:string){if(error instanceof OllamaTimeoutError)return`O modelo local ${error.model} demorou mais que o esperado para ${action}. Etapa: ${error.phase}. Limite: ${error.timeoutSeconds} segundos.`;if(error instanceof OllamaConnectionError)return"Não consegui conectar ao Ollama. Verifique se o serviço local está em execução.";if(error instanceof OllamaModelNotFoundError)return error.message;if(error instanceof OllamaInvalidResponseError)return`O Ollama respondeu, mas a resposta não pôde ser interpretada: ${error.message}`;if(error instanceof OllamaUnavailableError)return`A IA local está indisponível: ${error.message}`;return`Não consegui ${action}: ${error instanceof Error?error.message:String(error)}`;}
  private formatResults(done:{step:PlanStep;result:ToolResult}[]){if(!done.length)return"Nenhum resultado.";return done.map(item=>item.result.summary).join("\n");}
}
function toolErrorMessage(error:import("@nexo/shared").ToolResult["error"]){return error?.message;}
function toolFailure(code:string,message:string):ToolResult{return{success:false,ok:false,summary:message,error:{code,message}};}
