import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import type { BrowserAgentService } from "../../browser-agent/service.js";

export function browserAgentTools(service:BrowserAgentService):ToolDefinition[] {
  return [{
    name:"browser_agent_run",
    description:"Executa uma tarefa web autônoma de múltiplas etapas no Browser Agent do Nexo com visualização ao vivo no chat. Use para pesquisar, navegar e ler sites; se já existir uma execução ativa na mesma conversa, a nova solicitação orienta essa execução em vez de abrir outra.",
    risk:"READ",
    permissions:["browser.use"],
    domain:"browser",
    operation:"agent_run",
    mutatesState:false,
    inputSchema:z.object({
      request:z.string().min(1).max(20_000),
      mode:z.enum(["research","personal"]).default("research"),
      allowedDomains:z.array(z.string().min(1).max(253)).max(20).optional(),
      maxSteps:z.number().int().min(1).max(80).optional(),
      timeoutMs:z.number().int().min(10_000).max(600_000).optional()
    }),
    async execute(input, context) {
      if (!context?.conversationId) return {ok:false, summary:"O Browser Agent precisa ser executado dentro de uma conversa.", error:"conversationId ausente"};
      const outcome = await service.startOrSteer({
        conversationId:context.conversationId,
        taskId:context.taskId,
        request:input.request,
        mode:input.mode,
        allowedDomains:input.allowedDomains,
        maxSteps:input.maxSteps,
        timeoutMs:input.timeoutMs
      }, context.signal);
      return {
        ok:true,
        summary:outcome.command === "steered" ? "Orientação enviada ao navegador em execução." : "Browser Agent iniciado. Acompanhe a navegação ao vivo no chat.",
        data:outcome
      };
    }
  }];
}
