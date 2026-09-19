import { randomUUID } from "node:crypto";
import { responsePolicy } from "../chat/presentation/response-policy.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentIntent, ApprovalPlanMetadata, DeferredAction } from "../agent/orchestrator/intent-schema.js";
import { adaptDeterministicTool, filesystemOperations, HybridIntentResolver, IntentToolMapper, normalizeIntentInput } from "../intent/index.js";
import type { CanonicalIntent } from "../intent/types.js";
import type { LocalMetricsService } from "../observability/metrics.js";
import type { ConversationActionContextState } from "../agent/context/conversation-action-context.js";
import { deterministicFilesystemIntent } from "../agent/orchestrator/filesystem-intent-enricher.js";
import { buildIntentPlan } from "../agent/orchestrator/plan-builder.js";
import { validateIntentRequirements } from "../agent/orchestrator/intent-requirements-validator.js";
import { DeterministicRouter } from "../router/deterministic-router.js";
import { FilesystemCommandResolver, filesystemCommandTool } from "../filesystem/intent/filesystem-command-resolver.js";
import type { ActionContextFile } from "../agent/context/conversation-action-context.js";
import { PreRoutingSafetyGuard } from "./pre-routing-safety-guard.js";
import { RouteConflictGuard } from "./route-conflict-guard.js";

const mutationIntents = new Set(["create", "send", "update", "delete", "move"]);

export type CommandRoute =
  | { type: "tool"; tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata; executionId?: string; responseMode?: "synthesize" | "deterministic" | "presentation"; intent?: AgentIntent; deferredAction?: DeferredAction }
  | { type: "macro"; operation: string; input: Record<string, unknown>; explanation?: string }
  | { type: "chat"; response?: string; stream?: true }
  | { type:"clarification"; action:"open_file"|"analyze_file"; files:ActionContextFile[]; intent:AgentIntent }
  | { type: "unknown" };

export type HybridIntentDiagnosticsV2={
  requestId:string;
  originalInput?:string;
  normalizedInput?:string;
  safety?:{status:string;reason?:string};
  exactCandidate?:{source:string;route:string;accepted:boolean;rejectedReason?:string};
  hybrid?:{invoked:boolean;model?:string;status?:string;operation?:string;entities?:Record<string,unknown>;missing?:string[];ambiguities?:Array<{code:string;field?:string;message:string;critical?:boolean}>;confidence?:number};
  mapping?:{tool?:string;deferredAction?:string;resolvedScope?:string};
  finalRoute?:{source:string;type:string;tool?:string};
  latency:{totalMs:number;hybridMs?:number;parserMs?:number;validationMs?:number;mappingMs?:number};
};

export type HybridCommandOptions = {
  resolver: HybridIntentResolver;
  mapper: IntentToolMapper;
  enabled: () => boolean;
  shadowMode: () => boolean;
  filesystemEnabled: () => boolean;
  routingV2Enabled?:()=>boolean;
  diagnosticsEnabled?:()=>boolean;
  metrics?: LocalMetricsService;
};

export class CommandService {
  private readonly fastRouter = new DeterministicRouter();
  private readonly filesystemResolver = new FilesystemCommandResolver();
  private readonly safetyGuard = new PreRoutingSafetyGuard();
  private readonly conflictGuard = new RouteConflictGuard();
  private lastDiagnostics?:HybridIntentDiagnosticsV2;

  constructor(private readonly registry: ToolRegistry, private readonly allowedRoots: () => string[] = () => [], private readonly hybrid?: HybridCommandOptions) {}

  /** Canonical async routing entry point for AgentEngine in Routing V2. */
  async resolve(text:string,previous?:ConversationActionContextState,signal?:AbortSignal):Promise<CommandRoute>{
    if(this.hybrid?.routingV2Enabled?.()===false){
      const legacy=this.route(text,previous);
      return legacy.type==="unknown"?this.routeHybrid(text,previous,signal):legacy;
    }

    const started=Date.now(),requestId=randomUUID(),normalized=normalizeIntentInput(text);
    const diagnostics:HybridIntentDiagnosticsV2={requestId,originalInput:text,normalizedInput:normalized.routingText,hybrid:{invoked:false},latency:{totalMs:0}};
    const finish=(route:CommandRoute,source:string)=>{
      diagnostics.finalRoute={source,type:route.type,tool:route.type==="tool"?route.tool:undefined};
      diagnostics.latency.totalMs=Date.now()-started;
      this.lastDiagnostics=diagnostics;
      return route;
    };

    const safety=this.safetyGuard.evaluate(normalized);
    diagnostics.safety={status:safety.status,reason:safety.terminal?safety.reason:undefined};
    if(safety.terminal){
      this.hybrid?.metrics?.record(safety.status==="negated"?"intent.safety.negated":safety.status==="informational"?"intent.safety.informational":"intent.safety.traversal",1);
      return finish(safety.status==="informational"?{type:"chat",stream:true}:{type:"chat",response:safety.response},"safety");
    }

    const exact=this.routeExact(text,previous);
    if(exact.type!=="unknown"){
      const conflict=this.conflictGuard.evaluate(text,exact);
      diagnostics.exactCandidate={source:"exact",route:routeLabel(exact),accepted:conflict.accepted,...(!conflict.accepted?{rejectedReason:conflict.reason}:{})};
      if(conflict.accepted){
        this.hybrid?.metrics?.record("intent.route.exact.accepted",1,{route:routeLabel(exact)});
        void this.evaluateShadow(text,exact,previous,signal).catch(()=>undefined);
        return finish(exact,"exact");
      }
      this.hybrid?.metrics?.record("intent.route.exact.rejected",1,{reason:conflict.reason});
      this.hybrid?.metrics?.record("intent.route.conflict.read_vs_mutation",1,{route:routeLabel(exact)});
    }

    if(this.shouldInvokeHybrid(text)){
      diagnostics.hybrid!.invoked=true;
      this.hybrid?.metrics?.record("intent.route.hybrid.invoked",1);
      const hybridStarted=Date.now();
      const hybrid=await this.routeHybridInternal(text,previous,signal);
      diagnostics.latency.hybridMs=Date.now()-hybridStarted;
      const resolverDiag=this.hybrid?.resolver.diagnostics();
      diagnostics.hybrid={invoked:true,model:resolverDiag?.model,status:resolverDiag?.status,operation:resolverDiag?.operation,entities:resolverDiag?.entities,missing:resolverDiag?.missing,ambiguities:resolverDiag?.ambiguities,confidence:resolverDiag?.confidence};
      diagnostics.latency.parserMs=resolverDiag?.parserMs;
      diagnostics.latency.validationMs=resolverDiag?.validationMs;
      diagnostics.latency.mappingMs=Math.max(0,(diagnostics.latency.hybridMs??0)-(resolverDiag?.latencyMs??0));
      if(hybrid.type!=="unknown"){
        const conflict=this.conflictGuard.evaluate(text,hybrid);
        if(conflict.accepted){
          this.hybrid?.metrics?.record(hybrid.type==="chat"?"intent.route.hybrid.clarification":"intent.route.hybrid.resolved",1,{route:routeLabel(hybrid)});
          if(hybrid.type==="tool")diagnostics.mapping={tool:hybrid.tool,deferredAction:hybrid.deferredAction?.kind,resolvedScope:resolvedScopeFromRoute(hybrid)};
          return finish(hybrid,"hybrid");
        }
        this.hybrid?.metrics?.record("intent.route.conflict.read_vs_mutation",1,{route:routeLabel(hybrid)});
      }else this.hybrid?.metrics?.record("intent.route.hybrid.unknown",1);
    }

    const legacy=this.routeLegacyFallback(text,previous);
    if(legacy.type!=="unknown"){
      const conflict=this.conflictGuard.evaluate(text,legacy);
      if(conflict.accepted){
        this.hybrid?.metrics?.record("intent.route.legacy_fallback",1,{route:routeLabel(legacy)});
        return finish(legacy,"legacy");
      }
      this.hybrid?.metrics?.record("intent.route.conflict.read_vs_mutation",1,{route:routeLabel(legacy)});
    }

    const chat=this.conversationFallback(text);
    this.hybrid?.metrics?.record("intent.route.chat_fallback",1);
    return finish(chat,"chat");
  }

  /** Compatibility route retained for rollback/tests during the RC. */
  route(text: string, previous?: ConversationActionContextState): CommandRoute {
    const unsupportedSpreadsheet = this.filesystemResolver.unsupportedSpreadsheetCreation(text);
    if (unsupportedSpreadsheet) return { type: "chat", response: unsupportedSpreadsheet };
    const indexedFile=previousFileAtRequestedPosition(text,previous?.files??[]);
    if(indexedFile)return this.fromToolStep({tool:"file_info",input:{path:indexedFile.path},explanation:`Consultando ${indexedFile.name} da lista anterior…`});
    const fileAction=previousFileAction(text);
    if(fileAction&&previous?.files&&previous.files.length>1){
      const intent:AgentIntent={schemaVersion:1,status:"needs_clarification",domain:"filesystem",intent:fileAction==="analyze_file"?"summarize":"read",operation:fileAction,entities:{files:previous.files},referencesPreviousResult:true,requiresDataLookup:false,requiresConfirmation:false,confidence:1,missing:["fileMatch"],question:`Encontrei ${previous.files.length} arquivos. Qual deles você quer ${fileAction==="analyze_file"?"analisar":"abrir"}?`};
      return{type:"clarification",action:fileAction,files:previous.files,intent};
    }
    const filesystemCommand = this.filesystemResolver.resolve(text, this.allowedRoots(), undefined, previous?.files);
    if (filesystemCommand) {
      this.hybrid?.metrics?.record("intent.resolve.deterministic",1,{operation:filesystemCommandTool(filesystemCommand).tool});
      return this.fromToolStep(filesystemCommandTool(filesystemCommand));
    }
    const filesystemIntent = deterministicFilesystemIntent(text);
    if (filesystemIntent) {
      const intent = validateIntentRequirements(filesystemIntent);
      const tools = this.registry.listForAgent().map(tool => ({ ...tool, domain: tool.domain ?? domainFromName(tool.name), operation: tool.operation ?? tool.name }));
      const built = buildIntentPlan(intent, tools, previous);
      if (built.steps?.length === 1) return this.fromToolStep(built.steps[0], intent);
      if (built.steps?.length) return { type: "unknown" };
      if (built.direct) {
        if (mutationIntents.has(intent.intent) || /\b(crie|criar|apague|apagar|remova|remover|mova|mover|renomeie|renomear|salve|salvar|atualize|atualizar)\b/i.test(text)) return { type: "unknown" };
        return { type: "chat", response: built.direct };
      }
      if (built.directStream) return { type: "chat", stream: true };
    }
    const routed = this.fastRouter.route(text, { allowedRoots: this.allowedRoots() });
    if (routed.type === "unknown") return isLikelyConversation(text) ? { type: "chat", stream: true } : routed;
    if (routed.type === "macro") return routed;
    if (routed.type === "tool") return this.fromToolStep({ tool: routed.tool, input: routed.input, explanation: routed.explanation });
    return routed.response&&!isLikelyConversation(text)?{type:"unknown"}:routed;
  }

  /** Compatibility Hybrid entry point retained for rollback/tests. */
  async routeHybrid(text:string,previous?:ConversationActionContextState,signal?:AbortSignal):Promise<CommandRoute>{
    const safety=this.safetyGuard.evaluate(normalizeIntentInput(text));
    if(safety.terminal){
      if(safety.status==="informational")return{type:"chat",stream:true};
      return{type:"chat",response:safety.response};
    }
    if(!this.hybrid||!this.hybrid.enabled()||this.hybrid.shadowMode()||!this.hybrid.filesystemEnabled()||!mayBeFilesystemRequest(text)||hasExplicitPhysicalPath(text))return{type:"unknown"};
    return this.routeHybridInternal(text,previous,signal);
  }

  async evaluateShadow(text:string,deterministic:CommandRoute,previous?:ConversationActionContextState,signal?:AbortSignal){
    if(!this.hybrid||!this.hybrid.enabled()||!this.hybrid.shadowMode()||!this.hybrid.filesystemEnabled()||deterministic.type!=="tool"||!mayBeFilesystemRequest(text)||hasExplicitPhysicalPath(text))return;
    const baseline=adaptDeterministicTool(deterministic.tool,deterministic.input);if(!baseline)return;
    const resolution=await this.hybrid.resolver.resolve({text,allowedDomains:["filesystem"],availableOperations:[...filesystemOperations.filter(operation=>Boolean(this.registry.get(operation)))],context:{previousDomain:previous?.lastDomain,previousOperation:previous?.lastTool},signal});
    if(resolution.status!=="resolved"){
      if(resolution.status==="unknown")this.hybrid.metrics?.record("intent.shadow.resolver_error",1,{reason:resolution.reason});
      return;
    }
    const same=resolution.intent.operation===baseline.operation;
    this.hybrid.metrics?.record(same?"intent.shadow.same_operation":"intent.shadow.different_operation",1,{deterministic:baseline.operation,hybrid:resolution.intent.operation});
    if(same){
      const left=JSON.stringify(Object.fromEntries(Object.entries(baseline.entities).map(([key,value])=>[key,value.value])));
      const right=JSON.stringify(Object.fromEntries(Object.entries(resolution.intent.entities).map(([key,value])=>[key,value.value])));
      if(left!==right)this.hybrid.metrics?.record("intent.shadow.different_entities",1,{operation:baseline.operation});
    }
  }

  hybridDiagnostics(){
    if(!this.lastDiagnostics)return this.hybrid?.resolver.diagnostics();
    if(this.hybrid?.diagnosticsEnabled?.()){
      return structuredClone({
        ...this.lastDiagnostics,
        routing:{
          source:this.lastDiagnostics.finalRoute?.source,
          operation:this.lastDiagnostics.hybrid?.operation,
          tool:this.lastDiagnostics.finalRoute?.tool,
          deferredAction:this.lastDiagnostics.mapping?.deferredAction
        }
      });
    }
    const hybrid=this.lastDiagnostics.hybrid;
    return{
      requestId:this.lastDiagnostics.requestId,
      safety:this.lastDiagnostics.safety,
      hybrid:hybrid?{invoked:hybrid.invoked,status:hybrid.status,operation:hybrid.operation,confidence:hybrid.confidence}:undefined,
      finalRoute:this.lastDiagnostics.finalRoute,
      latency:this.lastDiagnostics.latency
    };
  }

  private routeExact(text:string,previous?:ConversationActionContextState):CommandRoute{
    const unsupportedSpreadsheet=this.filesystemResolver.unsupportedSpreadsheetCreation(text);
    if(unsupportedSpreadsheet)return{type:"chat",response:unsupportedSpreadsheet};
    const indexedFile=previousFileAtRequestedPosition(text,previous?.files??[]);
    if(indexedFile)return this.fromToolStep({tool:"file_info",input:{path:indexedFile.path},explanation:`Consultando ${indexedFile.name} da lista anterior…`});
    const fileAction=previousFileAction(text);
    if(fileAction&&previous?.files&&previous.files.length>1){
      const intent:AgentIntent={schemaVersion:1,status:"needs_clarification",domain:"filesystem",intent:fileAction==="analyze_file"?"summarize":"read",operation:fileAction,entities:{files:previous.files},referencesPreviousResult:true,requiresDataLookup:false,requiresConfirmation:false,confidence:1,missing:["fileMatch"],question:`Encontrei ${previous.files.length} arquivos. Qual deles você quer ${fileAction==="analyze_file"?"analisar":"abrir"}?`};
      return{type:"clarification",action:fileAction,files:previous.files,intent};
    }
    const command=this.filesystemResolver.resolve(text,this.allowedRoots(),undefined,previous?.files);
    if(command){
      const step=filesystemCommandTool(command);
      this.hybrid?.metrics?.record("intent.resolve.deterministic",1,{operation:step.tool});
      return this.fromToolStep(step);
    }
    // Preserve already-stable exact routes outside filesystem. Broad
    // filesystem heuristics remain in routeLegacyFallback after Hybrid.
    const other=this.fastRouter.route(text,{allowedRoots:this.allowedRoots()});
    if(other.type==="macro")return other;
    if(other.type==="tool"){
      const definition=this.registry.get(other.tool);
      const domain=definition?.domain??domainFromName(other.tool);
      if(domain!=="filesystem")return this.fromToolStep({tool:other.tool,input:other.input,explanation:other.explanation});
    }
    return{type:"unknown"};
  }

  private async routeHybridInternal(text:string,previous?:ConversationActionContextState,signal?:AbortSignal):Promise<CommandRoute>{
    if(!this.hybrid||!this.hybrid.enabled()||this.hybrid.shadowMode()||!this.hybrid.filesystemEnabled()||hasExplicitPhysicalPath(text))return{type:"unknown"};
    const availableOperations=filesystemOperations.filter(operation=>Boolean(this.registry.get(operation)));
    const resolution=await this.hybrid.resolver.resolve({text,allowedDomains:["filesystem"],availableOperations:[...availableOperations],context:{previousDomain:previous?.lastDomain,previousOperation:previous?.lastTool},signal});
    if(resolution.status==="unknown")return{type:"unknown"};
    if(resolution.status==="clarification")return{type:"chat",response:resolution.question};
    const intent=preserveExplicitScope(resolution.intent,text);
    const mapped=this.hybrid.mapper.map(intent);
    if(mapped.type==="unknown")return{type:"unknown"};
    if(mapped.type==="clarification")return{type:"chat",response:mapped.question};
    return this.fromToolStep({tool:mapped.tool,input:mapped.input,explanation:mapped.explanation},mapped.intent,mapped.deferredAction,mapped.responseMode);
  }

  private routeLegacyFallback(text:string,previous?:ConversationActionContextState):CommandRoute{
    const filesystemIntent=deterministicFilesystemIntent(text);
    if(filesystemIntent){
      const intent=validateIntentRequirements(filesystemIntent);
      const tools=this.registry.listForAgent().map(tool=>({...tool,domain:tool.domain??domainFromName(tool.name),operation:tool.operation??tool.name}));
      const built=buildIntentPlan(intent,tools,previous);
      if(built.steps?.length===1)return this.fromToolStep(built.steps[0],intent);
      if(built.steps?.length)return{type:"unknown"};
      if(built.direct&&!mutationIntents.has(intent.intent))return{type:"chat",response:built.direct};
      if(built.directStream)return{type:"chat",stream:true};
    }
    const routed=this.fastRouter.route(text,{allowedRoots:this.allowedRoots()});
    if(routed.type==="tool")return this.fromToolStep({tool:routed.tool,input:routed.input,explanation:routed.explanation});
    return routed;
  }

  private conversationFallback(text:string):CommandRoute{
    // Preserve the existing Agent V2/planner path for operational requests that
    // none of the command routers resolved. Only obvious conversation becomes
    // a direct chat stream here.
    return isLikelyConversation(text)?{type:"chat",stream:true}:{type:"unknown"};
  }

  private shouldInvokeHybrid(text:string){
    return Boolean(this.hybrid?.enabled()&&this.hybrid.filesystemEnabled()&&!this.hybrid.shadowMode()&&!hasExplicitPhysicalPath(text)&&mayBeFilesystemRequest(text));
  }

  private fromToolStep(step: { tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata; executionId?: string }, intent?: AgentIntent, deferredAction?:DeferredAction, responseModeOverride?:"synthesize"|"deterministic"|"presentation"): CommandRoute {
    if (step.tool.startsWith("macro_")) return { type: "macro", operation: step.tool.slice("macro_".length), input: step.input, explanation: step.explanation };
    const responseMode = responseModeOverride??responsePolicy([step.tool], intent).mode;
    return { type: "tool", tool: step.tool, input: step.input, explanation: step.explanation, approval: step.approval, executionId: step.executionId, responseMode, intent, deferredAction };
  }
}

function previousFileAtRequestedPosition(text:string,files:ActionContextFile[]){
  if(files.length<2||!/\b(?:arquivos?|deles|delas|anteriores?|resultados?|lista)\b/i.test(text))return undefined;
  const ordinal=text.match(/\b(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|[uú]ltim[oa])\b|\b(\d+)(?:[ºª])\b/i);
  if(!ordinal)return undefined;
  const word=ordinal[1]?.toLowerCase();
  const index=word?.startsWith("primeir")?0:word?.startsWith("segund")?1:word?.startsWith("terceir")?2:word?.startsWith("quart")?3:word?.startsWith("quint")?4:word?.startsWith("últim")||word?.startsWith("ultim")?files.length-1:ordinal[2]?Number(ordinal[2])-1:-1;
  return index>=0&&index<files.length?files[index]:undefined;
}

function previousFileAction(text:string):"open_file"|"analyze_file"|undefined{
  if(!/\b(?:esse|este|essa|esta|anterior|encontrado)\b/i.test(text)||! /\barquivo\b/i.test(text))return undefined;
  if(/\b(?:abra|abrir|abre|open)\b/i.test(text))return"open_file";
  if(/\b(?:analise|analisar|resuma|resumir|leia|ler|explique)\b/i.test(text))return"analyze_file";
  return undefined;
}

function domainFromName(name:string){
  if(name.startsWith("email_"))return"email";
  if(name.startsWith("calendar_"))return"calendar";
  if(name.startsWith("browser_"))return"browser";
  if(name.startsWith("memory_"))return"memory";
  if(/file|folder/.test(name))return"filesystem";
  return"system";
}

function isLikelyConversation(text:string){
  const normalized=text.trim().toLowerCase();
  if(/^(me\s+)?ensine\b|^(me\s+)?explique\b|^me\s+ajude\s+(?:a\s+)?(?:aprender|entender|estudar)\b|^vamos\s+conversar\b/i.test(normalized))return true;
  if(/\b(arquivos?|pastas?|navegador|aplicativo|programa|processo|disco|mem[oó]ria|downloads?|desktop|documentos?|documents?)\b|\.[a-z0-9]{2,8}\b|\b[a-z]:[\\/]|\\\\/i.test(normalized))return false;
  if(/\b(abra|abrir|liste|listar|procure|pesquise|salve|salvar|guarde|lembre|apague|remova|delete|execute|rode|mova|copie|renomeie|crie|criar|edite|editar|altere|alterar|troque|mude|faça|fazer)\b/i.test(normalized))return false;
  return true;
}

function mayBeFilesystemRequest(text:string){
  return /\b(?:arquivos?|pastas?|pastinha|diret[oó]rios?|downloads?|baixados|documentos?|documents?|desktop|[aá]rea\s+de\s+trabalho|conte[uú]do|renomeie|copie|mova|apague|edite|altere|troque)\b|\.[a-z0-9]{1,12}\b|\b[A-Za-z]:[\\/]/iu.test(text);
}

function hasExplicitPhysicalPath(text:string){
  return /\b[A-Za-z]:[\\/]/.test(text)
    ||/(?:^|\s)\\\\[^\s]+/.test(text)
    ||/(?:^|\s)\/(?:[^\s/]+(?:\/[^\s/]+)*)/.test(text);
}

function routeLabel(route:CommandRoute){
  return route.type==="tool"?route.tool:route.type==="macro"?`macro_${route.operation}`:route.type;
}


const SCOPE_AWARE_OPERATIONS=new Set(["find_file","search_files","list_files","create_folder","create_text_file","write_text_file"]);
function preserveExplicitScope(intent:CanonicalIntent,text:string):CanonicalIntent{
  if(!SCOPE_AWARE_OPERATIONS.has(intent.operation))return intent;
  const raw=extractExplicitScope(text);if(!raw)return intent;
  const current=intent.entities.folder?.value;
  if(typeof current==="string"&&foldScope(current)===foldScope(raw))return intent;
  return{...intent,entities:{...intent.entities,folder:{value:raw,source:"user",confidence:1}}};
}
function extractExplicitScope(text:string){
  const match=text.match(/\b(?:em|no|na|nos|nas|dentro\s+(?:de|da|do|das|dos))\s+(?:(?:minha|meu|minhas|meus)\s+)?(?:(?:pasta|diret[oó]rio)(?:\s+(?:de|do|da|dos|das))?\s+)?(.+?)(?=\s+(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+(?:coloque|escreva)|por\s+|para\s+)|[.!?]*$)/iu);
  return match?.[1]?.trim().replace(/[.!?]+$/u,"").trim()||undefined;
}
function foldScope(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/\s+/g," ").trim();}


function resolvedScopeFromRoute(route:Extract<CommandRoute,{type:"tool"}>){
  const candidate=route.input.root??route.input.path;
  return typeof candidate==="string"?candidate:undefined;
}
