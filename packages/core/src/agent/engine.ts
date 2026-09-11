import type { ToolResult } from "@nexo/shared";
import { AgentPlanner, type PlanStep, type Plan } from "./planner.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionEngine } from "../permissions/policy.js";
import { ApprovalService } from "../permissions/approvals.js";
import { AuditService } from "../audit/audit.js";
import {
  OllamaConnectionError,
  OllamaInvalidResponseError,
  OllamaModelNotFoundError,
  OllamaTimeoutError,
  OllamaUnavailableError
} from "../llm/errors.js";

export type AgentReply = { text: string; result?: ToolResult; results?: ToolResult[]; approvalId?: string };
export type AgentRunHooks = {
  onStatus?: (message: string) => void;
  onToken?: (token: string) => void;
  onReplaceText?: (text: string) => void;
};

export class AgentEngine {
  constructor(
    private planner: AgentPlanner,
    private registry: ToolRegistry,
    private permissions: PermissionEngine,
    private approvals: ApprovalService,
    private audit: AuditService
  ) {}

  async run(userText: string, hooks: AgentRunHooks = {}): Promise<AgentReply> {
    let plan: Plan;
    try {
      hooks.onStatus?.("Classificando sua solicitação…");
      plan = await this.planner.plan(userText);
    } catch (error) {
      const text = this.formatOllamaError(error, "interpretar este pedido");
      hooks.onReplaceText?.(text);
      hooks.onStatus?.("Não foi possível concluir a interpretação.");
      return { text };
    }

    if (plan.directStream) {
      hooks.onStatus?.("Conversa identificada. Preparando a IA local…");
      hooks.onReplaceText?.("");
      try {
        hooks.onStatus?.("A IA local está gerando a resposta…");
        const streamed = await this.planner.streamDirectAnswer(userText, token => hooks.onToken?.(token));
        hooks.onStatus?.("Resposta concluída.");
        return { text: streamed };
      } catch (error) {
        const text = this.formatOllamaError(error, "gerar a resposta");
        hooks.onReplaceText?.(text);
        hooks.onStatus?.("A geração da resposta foi interrompida.");
        return { text };
      }
    }

    if (typeof plan.direct === "string") {
      hooks.onStatus?.(plan.origin === "fast" ? "Resposta resolvida localmente." : "Resposta interpretada pela IA local.");
      hooks.onReplaceText?.(plan.direct);
      hooks.onStatus?.("Resposta concluída.");
      return { text: plan.direct };
    }

    const steps: PlanStep[] = plan.steps ?? (plan.tool ? [{ tool: plan.tool, input: plan.input ?? {}, explanation: plan.explanation }] : []);
    if (!steps.length) {
      const text = "Não identifiquei uma ação segura para executar.";
      hooks.onReplaceText?.(text);
      return { text };
    }
    if (steps.length > 8) {
      const text = "O plano excedeu o limite seguro de etapas.";
      hooks.onReplaceText?.(text);
      return { text };
    }

    hooks.onStatus?.(plan.origin === "fast" ? "Comando reconhecido localmente." : "Plano de execução preparado.");

    const done: { step: PlanStep; result: ToolResult }[] = [];
    for (const step of steps) {
      hooks.onStatus?.(step.explanation ?? `Executando ${step.tool}…`);
      const tool = this.registry.get(step.tool);
      if (!tool) {
        const text = `Ferramenta não disponível: ${step.tool}`;
        hooks.onReplaceText?.(text);
        return { text };
      }

      const parsed = tool.inputSchema.safeParse(step.input ?? {});
      if (!parsed.success) {
        const text = `Não consegui validar os parâmetros de ${tool.name}: ${parsed.error.issues.map(x => x.message).join(", ")}`;
        hooks.onReplaceText?.(text);
        return { text };
      }

      try {
        for (const field of tool.pathFields ?? []) {
          const value = (parsed.data as any)[field];
          if (typeof value === "string") this.permissions.assertPath(value);
          if (Array.isArray(value)) value.forEach(v => typeof v === "string" && this.permissions.assertPath(v));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const pathValue = (tool.pathFields ?? [])
          .map(field => (parsed.data as any)[field])
          .find(value => typeof value === "string") as string | undefined;
        const text = message.includes("fora do escopo permitido")
          ? `A pasta${pathValue ? ` ${pathValue}` : ""} não está autorizada para o Nexo. Adicione-a em Configurações → Segurança → Pastas permitidas.`
          : message;
        hooks.onReplaceText?.(text);
        hooks.onStatus?.("A execução foi bloqueada pelas permissões locais.");
        return { text };
      }

      const needsAutomaticMemoryApproval =
        step.tool === "memory_save" &&
        plan.origin === "llm" &&
        this.permissions.requiresAutomaticMemoryApproval();

      if (this.permissions.requiresApproval(tool.risk) || needsAutomaticMemoryApproval) {
        const approvalReason = needsAutomaticMemoryApproval
          ? "A IA identificou uma possível memória para salvar e sua configuração exige confirmação."
          : step.explanation ?? "Ação requer aprovação";
        const approval = this.approvals.create(tool.name, parsed.data, tool.risk, approvalReason);
        this.audit.record(tool.name, tool.risk, "awaiting_approval", parsed.data);
        const text = `Preciso da sua aprovação para executar: ${tool.description}.`;
        hooks.onReplaceText?.(text);
        hooks.onStatus?.("Aguardando sua aprovação.");
        return { text, approvalId: approval.id, results: done.map(x => x.result) };
      }

      const reply = await this.execute(tool.name, parsed.data);
      if (reply.result) done.push({ step, result: reply.result });
      if (reply.result && !reply.result.ok) {
        hooks.onReplaceText?.(reply.text);
        hooks.onStatus?.("A ferramenta retornou uma falha.");
        return { text: reply.text, result: reply.result, results: done.map(x => x.result) };
      }
      hooks.onStatus?.(`${tool.description}: concluído.`);
    }

    const finalReply = done.length === 1
      ? { text: done[0].result.summary, result: done[0].result }
      : { text: this.formatResults(done), results: done.map(x => x.result) };

    hooks.onReplaceText?.(finalReply.text);
    hooks.onStatus?.("Tarefa concluída.");
    return finalReply;
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<AgentReply> {
    const tool = this.registry.get(toolName);
    if (!tool) throw new Error("Ferramenta não encontrada");
    try {
      const result = await tool.execute(input);
      this.audit.record(tool.name, tool.risk, result.ok ? "success" : "failed", { input, result });
      return { text: result.summary, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.audit.record(tool.name, tool.risk, "error", { input, error: message });
      return { text: `Não consegui concluir a ação: ${message}`, result: { ok: false, summary: "Falha", error: message } };
    }
  }

  private formatOllamaError(error: unknown, action: string) {
    if (error instanceof OllamaTimeoutError) {
      return `O modelo local ${error.model} demorou mais que o esperado para ${action}. Etapa: ${error.phase}. Limite: ${error.timeoutSeconds} segundos.`;
    }
    if (error instanceof OllamaConnectionError) {
      return "Não consegui conectar ao Ollama. Verifique se o serviço local está em execução.";
    }
    if (error instanceof OllamaModelNotFoundError) {
      return error.message;
    }
    if (error instanceof OllamaInvalidResponseError) {
      return `O Ollama respondeu, mas a resposta não pôde ser interpretada: ${error.message}`;
    }
    if (error instanceof OllamaUnavailableError) {
      return `A IA local está indisponível: ${error.message}`;
    }
    return `Não consegui ${action}: ${error instanceof Error ? error.message : String(error)}`;
  }

  private formatResults(done: { step: PlanStep; result: ToolResult }[]) {
    const memory = done.find(x => x.step.tool === "memory_usage")?.result.data as any;
    const disks = done.find(x => x.step.tool === "disk_usage")?.result.data as any[] | undefined;
    const processes = done.find(x => x.step.tool === "process_list")?.result.data as any[] | undefined;
    const lines = ["Diagnóstico local concluído."];
    if (memory) lines.push(`Memória: ${memory.usedGB} GB usados de ${memory.totalGB} GB (${memory.availableGB} GB disponíveis).`);
    if (disks?.length) {
      const worst = [...disks].sort((a, b) => (b.use ?? 0) - (a.use ?? 0))[0];
      lines.push(`Disco mais ocupado: ${worst.mount || worst.fs} em ${worst.use}%.`);
    }
    if (processes?.length) {
      lines.push(`Maior uso de CPU agora: ${processes.slice(0, 3).map(p => `${p.name} (${Number(p.cpu).toFixed(1)}%)`).join(", ")}.`);
    }
    if (disks?.some(d => d.use >= 90)) lines.push("Atenção: existe unidade com 90% ou mais de ocupação.");
    if (memory && memory.availableGB < 2) lines.push("Atenção: há menos de 2 GB de memória disponível.");
    return lines.join("\n");
  }
}
