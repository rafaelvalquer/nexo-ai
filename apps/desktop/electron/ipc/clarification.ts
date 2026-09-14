import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";
import type { ClarificationResolutionRequest } from "@nexo/shared";

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} inválido.`);
  return value.trim();
}

function validateRequest(value: unknown): ClarificationResolutionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resposta de esclarecimento inválida.");
  const data = value as Record<string, unknown>;
  const clarificationId = requireString(data.clarificationId, "Esclarecimento");
  const questionId = requireString(data.questionId, "Pergunta");
  const optionId = typeof data.optionId === "string" && data.optionId.trim() ? data.optionId.trim() : undefined;
  const customValue = typeof data.customValue === "string" && data.customValue.trim() ? data.customValue.trim() : undefined;
  if (!optionId && !customValue) throw new Error("Selecione uma opção ou informe um valor.");
  return { clarificationId, questionId, optionId, customValue, source: customValue ? "custom_input" : "button" };
}

export function registerClarificationIpc(core: NexoCore) {
  ipcMain.handle("nexo:clarification:get-pending", (_, conversationId) =>
    core.agent.getPendingClarification(requireString(conversationId, "ID da conversa")),
  );

  ipcMain.handle("nexo:clarification:cancel", (_, clarificationId) =>
    core.agent.cancelClarification(requireString(clarificationId, "ID do esclarecimento")),
  );

  ipcMain.handle("nexo:clarification:resolve", async (_, request) => {
    const reply = await core.agent.resolveClarification(validateRequest(request));
    if (reply.conversationId && !core.getSettings().privateMode) {
      const presentation = reply.presentation ? { presentation: reply.presentation, bindings: [] } : undefined;
      core.conversations.addMessage(reply.conversationId, "assistant", reply.text, undefined, [], presentation);
    }
    return reply;
  });
}
