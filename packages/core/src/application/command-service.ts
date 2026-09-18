import { responsePolicy } from "../chat/presentation/response-policy.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentIntent, ApprovalPlanMetadata } from "../agent/orchestrator/intent-schema.js";
import type { ConversationActionContextState } from "../agent/context/conversation-action-context.js";
import { deterministicFilesystemIntent } from "../agent/orchestrator/filesystem-intent-enricher.js";
import { buildIntentPlan } from "../agent/orchestrator/plan-builder.js";
import { validateIntentRequirements } from "../agent/orchestrator/intent-requirements-validator.js";
import { DeterministicRouter } from "../router/deterministic-router.js";

const safeTools = new Set(["list_files", "largest_files", "search_files", "find_file", "memory_usage", "disk_usage", "system_info", "process_list"]);
const mutationIntents = new Set(["create", "send", "update", "delete", "move"]);

export type CommandRoute =
  | { type: "tool"; tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata; executionId?: string; responseMode?: "synthesize" | "deterministic" | "presentation"; intent?: AgentIntent }
  | { type: "macro"; operation: string; input: Record<string, unknown>; explanation?: string }
  | { type: "chat"; response?: string; stream?: true }
  | { type: "unknown" };

/** Routes deterministic work without invoking the semantic AgentPlanner. */
export class CommandService {
  private readonly fastRouter = new DeterministicRouter();
  constructor(private readonly registry: ToolRegistry, private readonly allowedRoots: () => string[] = () => []) {}

  route(text: string, previous?: ConversationActionContextState): CommandRoute {
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

  private fromToolStep(step: { tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata; executionId?: string }, intent?: AgentIntent): CommandRoute {
    if (step.tool.startsWith("macro_")) return { type: "macro", operation: step.tool.slice("macro_".length), input: step.input, explanation: step.explanation };
    const responseMode = responsePolicy([step.tool], intent).mode;
    return { type: "tool", tool: step.tool, input: step.input, explanation: step.explanation, approval: step.approval, executionId: step.executionId, responseMode, intent };
  }
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
