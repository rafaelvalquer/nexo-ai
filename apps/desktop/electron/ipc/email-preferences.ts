import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";

function requireConnectionId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("ID da conexão inválido.");
  return value.trim();
}

export function registerEmailPreferencesIpc(core: NexoCore) {
  ipcMain.handle("nexo:connections:email-preferences:get", (_, id) =>
    core.getEmailSearchPreferences(requireConnectionId(id))
  );
  ipcMain.handle("nexo:connections:email-preferences:save", (_, id, categories) => {
    if (!Array.isArray(categories) || !categories.every(value => typeof value === "string")) {
      throw new Error("Categorias inválidas.");
    }
    return core.saveEmailSearchPreferences(requireConnectionId(id), categories);
  });
}
