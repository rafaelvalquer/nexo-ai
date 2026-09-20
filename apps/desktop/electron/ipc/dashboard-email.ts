import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} inválido.`);
  return value.trim();
}

export function registerDashboardEmailIpc(core: NexoCore) {
  ipcMain.handle("nexo:dashboard:email-message", (_, connectionId, messageId) =>
    core.dashboardEmailMessage(requireString(connectionId, "Conexão"), requireString(messageId, "Mensagem"))
  );

  ipcMain.handle("nexo:dashboard:email-reply", (_, input) => {
    if (!input || typeof input !== "object") throw new Error("Dados de resposta inválidos.");
    const value = input as Record<string, unknown>;
    return core.dashboardEmailReply({
      connectionId: requireString(value.connectionId, "Conexão"),
      messageId: requireString(value.messageId, "Mensagem"),
      threadId: typeof value.threadId === "string" ? value.threadId : undefined,
      bodyText: requireString(value.bodyText, "Resposta")
    });
  });

  ipcMain.handle("nexo:dashboard:email-trash", (_, input) => {
    if (!input || typeof input !== "object") throw new Error("Dados de exclusão inválidos.");
    const value = input as Record<string, unknown>;
    return core.dashboardEmailTrash({
      connectionId: requireString(value.connectionId, "Conexão"),
      messageId: requireString(value.messageId, "Mensagem")
    });
  });
}
