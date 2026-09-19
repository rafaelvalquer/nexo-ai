import { responsePolicy } from "../chat/presentation/response-policy.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentIntent, ApprovalPlanMetadata, DeferredAction } from "../agent/orchestrator/intent-schema.js";
import { adaptDeterministicTool, filesystemOperations, HybridIntentResolver, IntentToolMapper } from "../intent/index.js";
import type { LocalMetricsService } from "../observability/metrics.js";
import type { ConversationActionContextState } from "../agent/context/conversation-action-context.js";
import { deterministicFilesystemIntent } from "../agent/orchestrator/filesystem-intent-enricher.js";
import { buildIntentPlan } from "../agent/orchestrator/plan-builder.js";
import { validateIntentRequirements } from "../agent/orchestrator/intent-requirements-validator.js";
import { DeterministicRouter } from "../router/deterministic-router.js";
import { FilesystemCommandResolver, filesystemCommandTool } from "../filesystem/intent/filesystem-command-resolver.js";
import type { ActionContextFile } from "../agent/context/conversation-action-context.js";

const mutationIntents = new Set(["create", "send", "update", "delete", "move"]);

export type CommandRoute =
  | { type: "tool"; tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata; executionId?: string; responseMode?: "synthesize" | "deterministic" | "presentation"; intent?: AgentIntent; deferredAction?: DeferredAction }
  | { type: "macro"; operation: string; input: Record<string, unknown>; explanation?: string }
  | { type: "chat"; response?: string; stream?: true }
  | { type:"clarification"; action:"open_file"|"analyze_file"; files:ActionContextFile[]; intent:AgentIntent }
  | { type: "unknown" };

/** Routes deterministic work without invoking the semantic AgentPlanner. */
export type HybridCommandOptions = {
  resolver: HybridIntentResolver;
  mapper: IntentToolMapper;
  enabled: () => boolean;
  shadowMode: () => boolean;
  filesystemEnabled: () => boolean;
  metrics?: LocalMetricsService;
};

export class CommandService {
  private readonly fastRouter = new DeterministicRouter();
  private readonly filesystemResolver = new FilesystemCommandResolver();
  constructor(private readonly registry: ToolRegistry, private readonly allowedRoots: () => string[] = () => [], private readonly hybrid?: HybridCommandOptions) {}

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

  async routeHybrid(text:string,previous?:ConversationActionContextState,signal?:AbortSignal):Promise<CommandRoute>{
    if(!this.hybrid||!this.hybrid.enabled()||this.hybrid.shadowMode()||!this.hybrid.filesystemEnabled()||!looksLikeFilesystemRequest(text)||hasExplicitPhysicalPath(text))return{type:"unknown"};
    const availableOperations=filesystemOperations.filter(operation=>Boolean(this.registry.get(operation)));
    const resolution=await this.hybrid.resolver.resolve({
      text,
      allowedDomains:["filesystem"],
      availableOperations:[...availableOperations],
      context:{previousDomain:previous?.lastDomain,previousOperation:previous?.lastTool},
      signal
    });
    if(resolution.status==="unknown"){
      if(resolution.reason==="NEGATED_ACTION")return{type:"chat",response:"Nenhuma ação foi executada porque o pedido contém uma negação explícita."};
      if(resolution.reason==="INFORMATIONAL_REQUEST")return{type:"chat",stream:true};
      return{type:"unknown"};
    }
    if(resolution.status==="clarification")return{type:"chat",response:resolution.question};
    const mapped=this.hybrid.mapper.map(resolution.intent);
    if(mapped.type==="unknown")return{type:"unknown"};
    if(mapped.type==="clarification")return{type:"chat",response:mapped.question};
    return this.fromToolStep({tool:mapped.tool,input:mapped.input,explanation:mapped.explanation},mapped.intent,mapped.deferredAction,mapped.responseMode);
  }

  async evaluateShadow(text:string,deterministic:CommandRoute,previous?:ConversationActionContextState,signal?:AbortSignal){
    if(!this.hybrid||!this.hybrid.enabled()||!this.hybrid.shadowMode()||!this.hybrid.filesystemEnabled()||deterministic.type!=="tool"||!looksLikeFilesystemRequest(text)||hasExplicitPhysicalPath(text))return;
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

  hybridDiagnostics(){return this.hybrid?.resolver.diagnostics();}

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

function domainFromName(name: string): string {
  if (name.startsWith("email_")) return "email";
  if (name.startsWith("calendar_")) return "calendar";
  if (name.startsWith("browser_")) return "browser";
  if (name.startsWith("memory_")) return "memory";
  if (/file|folder/.test(name)) return "filesystem";
  return "system";
}

function isLikelyConversation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (/^(me\s+)?ensine\b|^(me\s+)?explique\b|^me\s+ajude\s+(?:a\s+)?(?:aprender|entender|estudar)\b|^vamos\s+conversar\b/i.test(normalized)) return true;
  if (/\b(arquivos?|pastas?|navegador|aplicativo|programa|processo|disco|mem[oó]ria|downloads?|desktop|documentos?|documents?)\b|\.[a-z0-9]{2,8}\b|\b[a-z]:[\\/]|\\\\/i.test(normalized)) return false;
  if (/\b(abra|abrir|liste|listar|procure|pesquise|salve|salvar|guarde|lembre|apague|remova|delete|execute|rode|mova|copie|renomeie|crie\s+(?:uma\s+)?pasta|navegue|acesse|baixe|analise\s+(?:a\s+)?pasta)\b/i.test(normalized)) return false;
  return true;
}

function looksLikeFilesystemRequest(text:string){
  return /\b(arquivos?|pastas?|pastinha|diret[oó]rios?|downloads?|baixados|documentos?|documents?|desktop|[aá]rea\s+de\s+trabalho|conte[uú]do\s+do\s+arquivo)\b|\.[a-z0-9]{1,12}\b|\b[A-Za-z]:[\\/]/i.test(text);
}
function hasExplicitPhysicalPath(text:string){
  return /\b[A-Za-z]:[\\/]/.test(text)||/(?:^|\s)\\\\[^\s]+/.test(text)||/(?:^|\s)\/(?:[^\s/]+\/)*[^\s]*/.test(text);
}
