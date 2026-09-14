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
  const optionIds = Array.isArray(data.optionIds)
    ? [...new Set(data.optionIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim()))]
    : undefined;
  const customValue = typeof data.customValue === "string" && data.customValue.trim() ? data.customValue.trim() : undefined;
  if (!optionId && !optionIds?.length && !customValue) throw new Error("Selecione pelo menos uma opção ou informe um valor.");
  return { clarificationId, questionId, optionId, optionIds, customValue, source: customValue ? "custom_input" : "button" };
}

export function registerClarificationIpc(core: NexoCore) {
  ipcMain.handle("nexo:clarification:get-pending", (_, conversationId) =>
    core.agent.getPendingClarification(requireString(conversationId, "ID da conversa")),
  );

  ipcMain.handle("nexo:clarification:cancel", (_, clarificationId) => {
    const result = core.agent.cancelClarification(requireString(clarificationId, "ID do esclarecimento"));
    if (result?.conversationId && result.text && !core.getSettings().privateMode) {
      core.conversations.addMessage(result.conversationId, "assistant", result.text);
    }
    return result;
  });

  ipcMain.handle("nexo:clarification:resolve", async (_, request) => {
    const reply = await core.agent.resolveClarification(validateRequest(request));
    if (reply.conversationId && !core.getSettings().privateMode) {
      const presentation = reply.presentation ? { presentation: reply.presentation, bindings: [] } : undefined;
      core.conversations.addMessage(reply.conversationId, "assistant", reply.text, undefined, [], presentation);
    }
    return reply;
  });
}
