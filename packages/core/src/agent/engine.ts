import type { ToolResult } from "@nexo/shared";
import { AgentPlanner, type PlanStep, type Plan } from "./planner.js";
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
  signal?: AbortSignal;
  onToolStarted?: (toolName:string, label:string) => void;
  onToolCompleted?: (toolName:string, ok:boolean) => void;
  onApprovalRequested?: (approvalId:string, toolName:string) => void;
  visualContext?: { visualRunId:string; taskId?:string };
};

export class AgentEngine {
  constructor(
    private planner: AgentPlanner,
    private registry: ToolRegistry,
    private permissions: PermissionEngine,
    private approvals: ApprovalService,
    private audit: AuditService,
    private connections?: ConnectionService,
    private runtime?: AgentRuntime,
    private security?: SecurityPolicyService,
    private metrics?: LocalMetricsService
  ) {}

  async run(userText: string, hooks: AgentRunHooks = {}, context: LLMMessage[] = []): Promise<AgentReply> {
    const startedAt = Date.now();
    let plan: Plan;
    try {
      hooks.onStatus?.("Classificando sua solicitação…");
      plan = await this.planner.plan(userText, context, hooks.signal);
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
        const streamed = await this.planner.streamDirectAnswer(userText, token => hooks.onToken?.(token), context, hooks.signal);
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
    if (steps.length > AGENT_LIMITS.maxToolCalls) {
      const text = "O plano excedeu o limite seguro de etapas.";
      hooks.onReplaceText?.(text);
      return { text };
    }

    hooks.onStatus?.(plan.origin === "fast" ? "Comando reconhecido localmente." : "Plano de execução preparado.");

    const persistedRun = this.runtime?.start(userText, steps);
    const done: { step: PlanStep; result: ToolResult }[] = [];
    let modelFinalResponse: string | undefined;
    for (const [stepIndex, step] of steps.entries()) {
      if (hooks.signal?.aborted) throw hooks.signal.reason ?? new Error("Tarefa cancelada.");
      if (stepIndex >= AGENT_LIMITS.maxIterations) {
        const text = "O agente atingiu o limite seguro de iterações."; hooks.onReplaceText?.(text); if (persistedRun) this.runtime?.finish(persistedRun.id, "FAILED", text); return { text, results: done.map(item => item.result) };
      }
      if (Date.now() - startedAt > AGENT_LIMITS.maxExecutionMs) {
        const text = "O limite seguro de tempo de execução foi atingido."; hooks.onReplaceText?.(text); hooks.onStatus?.("Execução interrompida por limite de tempo."); return { text, results: done.map(item => item.result) };
      }
      hooks.onStatus?.(step.explanation ?? `Executando ${step.tool}…`);
      hooks.onToolStarted?.(step.tool, step.explanation ?? `Executando ${step.tool}`);
      if (persistedRun) this.runtime?.recordStep(persistedRun.id, stepIndex, step, "RUNNING");
      const tool = this.registry.get(step.tool);
      if (!tool) {
        const text = `Ferramenta não disponível: ${step.tool}`;
        hooks.onReplaceText?.(text);
        return { text };
      }
      try { this.security?.assertToolEnabled(tool.name); } catch (error) { const text=error instanceof Error?error.message:String(error); hooks.onReplaceText?.(text); return {text}; }

      const input = { ...(step.input ?? {}) } as Record<string, unknown>;
      if (!input.connectionId) {
        const capability = tool.permissions.find(permission => ["email.read", "email.send", "calendar.read", "calendar.write"].includes(permission));
        if (capability) {
          const account = this.connections?.defaultFor(capability as any);
          if (!account) {
            const service = capability.startsWith("email") ? "e-mail" : "calendário";
            const text = `Nenhuma conta de ${service} conectada possui a permissão necessária. Abra Conexões, conecte Google ou Microsoft e autorize ${capability}.`;
            hooks.onReplaceText?.(text); hooks.onStatus?.("Aguardando configuração de conexão."); return { text };
          }
          input.connectionId = account.id;
        }
      }
      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) {
        const text = `Não consegui validar os parâmetros de ${tool.name}: ${parsed.error.issues.map(x => x.message).join(", ")}`;
        hooks.onReplaceText?.(text);
        return { text };
      }
      try { this.security?.assertRecipientDomains((parsed.data as any).to); } catch (error) { const text=error instanceof Error?error.message:String(error); hooks.onReplaceText?.(text); return {text}; }

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

      // Store normalized input (including auto-selected connection) so a
      // checkpoint can resume after restart with the exact validated action.
      step.input = parsed.data as Record<string, unknown>;

      const needsAutomaticMemoryApproval =
        step.tool === "memory_save" &&
        plan.origin === "llm" &&
        this.permissions.requiresAutomaticMemoryApproval();

      if (this.permissions.requiresApproval(tool.risk) || this.security?.requiresApproval(tool.name, tool.risk) || needsAutomaticMemoryApproval) {
        const approvalReason = needsAutomaticMemoryApproval
          ? "A IA identificou uma possível memória para salvar e sua configuração exige confirmação."
          : step.explanation ?? "Ação requer aprovação";
        const checkpointId = persistedRun && this.runtime
          ? this.runtime.checkpoint(persistedRun.id, { userRequest: userText, steps, nextStep: stepIndex, results: done.map(item => item.result), iteration: stepIndex })
          : undefined;
        const approval = this.approvals.create(tool.name, parsed.data, tool.risk, approvalReason, checkpointId && persistedRun ? { agentRunId: persistedRun.id, checkpointId, ...hooks.visualContext } : undefined);
        if (checkpointId) this.runtime?.attachApproval(checkpointId, approval.id);
        this.audit.record(tool.name, tool.risk, "awaiting_approval", parsed.data);
        const text = `Preciso da sua aprovação para executar: ${tool.description}.`;
        hooks.onReplaceText?.(text);
        hooks.onStatus?.("Aguardando sua aprovação.");
        hooks.onApprovalRequested?.(approval.id, tool.name);
        return { text, approvalId: approval.id, results: done.map(x => x.result) };
      }

      const reply = await this.execute(tool.name, parsed.data);
      hooks.onToolCompleted?.(tool.name, Boolean(reply.result?.ok));
      if (persistedRun) this.runtime?.recordStep(persistedRun.id, stepIndex, step, reply.result?.ok ? "COMPLETED" : "FAILED", reply.result, reply.result?.error);
      if (reply.result) done.push({ step, result: reply.result });
      if (reply.result && !reply.result.ok) {
        hooks.onReplaceText?.(reply.text);
        hooks.onStatus?.("A ferramenta retornou uma falha.");
        return { text: reply.text, result: reply.result, results: done.map(x => x.result) };
      }
      hooks.onStatus?.(`${tool.description}: concluído.`);
      // LLM-originated runs may choose another tool only after seeing the
      // validated result. Static fast routes intentionally remain one-pass.
      if (plan.origin === "llm" && stepIndex === steps.length - 1 && done.length < AGENT_LIMITS.maxToolCalls) {
        try {
          const next = await this.planner.decideNext(userText, done.map(item => item.result), context);
          if (typeof next.direct === "string" && next.direct.trim()) modelFinalResponse = next.direct;
          else if (next.tool) steps.push({ tool: next.tool, input: next.input ?? {}, explanation: next.explanation });
        } catch {
          // The completed tool result is still useful; deterministic synthesis follows.
        }
      }
      if (persistedRun) this.runtime?.saveState(persistedRun.id, { userRequest: userText, steps, nextStep: stepIndex + 1, results: done.map(item => item.result), iteration: stepIndex + 1 });
      if (modelFinalResponse) break;
    }

    const fallbackReply = modelFinalResponse
      ? { text: modelFinalResponse, results: done.map(x => x.result) }
      : done.length === 1
      ? { text: done[0].result.summary, result: done[0].result }
      : { text: this.formatResults(done), results: done.map(x => x.result) };
    let finalReply = fallbackReply;
    if (done.length && plan.origin === "llm" && !modelFinalResponse) {
      try { finalReply = { ...fallbackReply, text: await this.planner.interpretToolResults(userText, done.map(item => item.result)) }; }
      catch { /* A execução já foi concluída; mantém o resumo determinístico se o modelo estiver indisponível. */ }
    }

    hooks.onReplaceText?.(finalReply.text);
    hooks.onStatus?.("Tarefa concluída.");
    this.metrics?.record("agent.tool_calls", done.length, { origin: plan.origin ?? "unknown" });
    this.metrics?.record("agent.iterations", steps.length, { origin: plan.origin ?? "unknown" });
    if (persistedRun) this.runtime?.finish(persistedRun.id, "COMPLETED", finalReply.text);
    return finalReply;
  }

  /** Runs the exact operation captured at approval time; it never re-plans or silently repeats earlier tools. */
  async resumeApproval(checkpointId: string, hooks: AgentRunHooks = {}): Promise<AgentReply> {
    if (!this.runtime) throw new Error("Runtime de agente indisponível.");
    const resumed = this.runtime.resume(checkpointId);
    if (!resumed) throw new Error("Checkpoint de aprovação não está disponível.");
    const step = resumed.state.steps[resumed.state.nextStep];
    if (!step) throw new Error("A etapa aprovada não foi encontrada.");
    const tool = this.registry.get(step.tool);
    if (!tool) { const text=`Ferramenta não disponível: ${step.tool}`; this.runtime.finish(resumed.run.id,"FAILED",text); return {text}; }
    try { this.security?.assertToolEnabled(tool.name); } catch (error) { const text=error instanceof Error?error.message:String(error); this.runtime.finish(resumed.run.id,"FAILED",text); return {text}; }
    const parsed=tool.inputSchema.safeParse(step.input);
    if (!parsed.success) { const text=`Não consegui validar novamente os parâmetros de ${tool.name}.`; this.runtime.finish(resumed.run.id,"FAILED",text); return {text}; }
    try {
      this.security?.assertRecipientDomains((parsed.data as any).to);
      for (const field of tool.pathFields ?? []) { const value=(parsed.data as Record<string,unknown>)[field]; if(typeof value==="string")this.permissions.assertPath(value); if(Array.isArray(value))value.forEach(item=>{if(typeof item==="string")this.permissions.assertPath(item);}); }
    } catch (error) { const text=error instanceof Error?error.message:String(error); this.runtime.finish(resumed.run.id,"FAILED",text); return {text}; }
    step.input=parsed.data as Record<string,unknown>;
    hooks.onStatus?.(step.explanation ?? `Retomando ${step.tool}…`);
    hooks.onToolStarted?.(step.tool,step.explanation ?? `Retomando ${step.tool}`);
    const reply = await this.execute(step.tool, parsed.data);
    hooks.onToolCompleted?.(step.tool,Boolean(reply.result?.ok));
    this.runtime.recordStep(resumed.run.id, resumed.state.nextStep, step, reply.result?.ok ? "COMPLETED" : "FAILED", reply.result, reply.result?.error);
    if (!reply.result?.ok) { this.runtime.finish(resumed.run.id, "FAILED", reply.text); return reply; }
    const results = [...resumed.state.results, reply.result];
    let nextState = { ...resumed.state, nextStep: resumed.state.nextStep + 1, results, iteration: resumed.state.iteration + 1 };
    this.runtime.saveState(resumed.run.id, nextState);
    while (nextState.nextStep < nextState.steps.length) {
      if (nextState.iteration >= AGENT_LIMITS.maxIterations || nextState.results.length >= AGENT_LIMITS.maxToolCalls) {
        const text = "O fluxo retomado atingiu o limite seguro de etapas."; this.runtime.finish(resumed.run.id, "FAILED", text); return { text, results: nextState.results };
      }
      const pending = nextState.steps[nextState.nextStep]; const tool = this.registry.get(pending.tool);
      if (!tool) { const text = `Ferramenta não disponível: ${pending.tool}`; this.runtime.finish(resumed.run.id, "FAILED", text); return { text, results: nextState.results }; }
      try { this.security?.assertToolEnabled(tool.name); } catch (error) { const text=error instanceof Error?error.message:String(error); this.runtime.finish(resumed.run.id,"FAILED",text); return {text,results:nextState.results}; }
      const input = { ...(pending.input ?? {}) } as Record<string, unknown>;
      if (!input.connectionId) {
        const capability = tool.permissions.find(permission => ["email.read", "email.send", "calendar.read", "calendar.write"].includes(permission));
        if (capability) {
          const account = this.connections?.defaultFor(capability as any);
          if (!account) { const text = `Nenhuma conta conectada possui a permissão necessária: ${capability}.`; this.runtime.finish(resumed.run.id, "FAILED", text); return { text, results: nextState.results }; }
          input.connectionId = account.id;
        }
      }
      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) { const text = `Não consegui validar os parâmetros de ${tool.name}.`; this.runtime.finish(resumed.run.id, "FAILED", text); return { text, results: nextState.results }; }
      try { this.security?.assertRecipientDomains((parsed.data as any).to); } catch (error) { const text=error instanceof Error?error.message:String(error); this.runtime.finish(resumed.run.id,"FAILED",text); return {text,results:nextState.results}; }
      try {
        for (const field of tool.pathFields ?? []) {
          const value = (parsed.data as Record<string, unknown>)[field];
          if (typeof value === "string") this.permissions.assertPath(value);
          if (Array.isArray(value)) value.forEach(item => { if (typeof item === "string") this.permissions.assertPath(item); });
        }
      } catch (error) { const text = error instanceof Error ? error.message : String(error); this.runtime.finish(resumed.run.id, "FAILED", text); return { text, results: nextState.results }; }
      if (this.permissions.requiresApproval(tool.risk) || this.security?.requiresApproval(tool.name, tool.risk)) {
        const checkpointId = this.runtime.checkpoint(resumed.run.id, nextState);
        const approval = this.approvals.create(tool.name, parsed.data, tool.risk, pending.explanation ?? "Ação requer aprovação", { agentRunId: resumed.run.id, checkpointId, ...hooks.visualContext });
        this.runtime.attachApproval(checkpointId, approval.id);
        hooks.onStatus?.("Aguardando sua aprovação.");
        hooks.onApprovalRequested?.(approval.id,tool.name);
        return { text: `Preciso da sua aprovação para executar: ${tool.description}.`, approvalId: approval.id, results: nextState.results };
      }
      this.runtime.recordStep(resumed.run.id, nextState.nextStep, pending, "RUNNING");
      hooks.onStatus?.(pending.explanation ?? `Executando ${pending.tool}…`);
      hooks.onToolStarted?.(pending.tool,pending.explanation ?? `Executando ${pending.tool}`);
      const continued = await this.execute(tool.name, parsed.data);
      hooks.onToolCompleted?.(pending.tool,Boolean(continued.result?.ok));
      this.runtime.recordStep(resumed.run.id, nextState.nextStep, pending, continued.result?.ok ? "COMPLETED" : "FAILED", continued.result, continued.result?.error);
      if (!continued.result?.ok) { this.runtime.finish(resumed.run.id, "FAILED", continued.text); return { ...continued, results: nextState.results }; }
      nextState = { ...nextState, nextStep: nextState.nextStep + 1, results: [...nextState.results, continued.result], iteration: nextState.iteration + 1 };
      this.runtime.saveState(resumed.run.id, nextState);
    }
    const text = nextState.results.at(-1)?.summary ?? reply.result.summary;
    this.runtime.finish(resumed.run.id, "COMPLETED", text);
    return { text, result: nextState.results.at(-1), results: nextState.results };
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<AgentReply> {
    const tool = this.registry.get(toolName);
    if (!tool) throw new Error("Ferramenta não encontrada");
    const startedAt = Date.now();
    try {
      const result = await tool.execute(input);
      this.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool:tool.name, ok:result.ok });
      if (!result.ok) this.metrics?.record("tool.failed", 1, {tool:tool.name});
      this.audit.record(tool.name, tool.risk, result.ok ? "success" : "failed", { input, result });
      return { text: result.summary, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.metrics?.record("tool.duration_ms", Date.now() - startedAt, { tool:tool.name, ok:false });
      this.metrics?.record("tool.failed", 1, {tool:tool.name});
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
