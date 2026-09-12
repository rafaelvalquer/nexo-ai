import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} inválido.`);
  return value.trim();
}

function requireBoolean(value: unknown, name: string) {
  if (typeof value !== "boolean") throw new Error(`${name} inválido.`);
  return value;
}

function validateExternalUrl(value: unknown) {
  const url = requireString(value, "URL");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL externa inválida.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("Somente URLs http/https podem ser abertas externamente.");
  }
  return parsed.toString();
}

function validateSettingsPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configurações inválidas.");
  const patch = value as Record<string, unknown>;
  const allowed = new Set([
    "model",
    "ollamaUrl",
    "autonomy",
    "allowedRoots",
    "privateMode",
    "runInBackground",
    "memoryEnabled",
    "memoryAskBeforeSave",
    "embeddingModel", "documentMaxSizeMb", "externalDataRetention", "connectionsEnabled", "ocrEnabled"
  ]);

  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) throw new Error(`Configuração não permitida: ${key}`);
  }
  if (patch.model !== undefined) requireString(patch.model, "Modelo");
  if (patch.ollamaUrl !== undefined) requireString(patch.ollamaUrl, "URL do Ollama");
  if (patch.autonomy !== undefined && !["cautious", "balanced", "autonomous"].includes(String(patch.autonomy))) {
    throw new Error("Nível de autonomia inválido.");
  }
  if (patch.allowedRoots !== undefined && (!Array.isArray(patch.allowedRoots) || !patch.allowedRoots.every(x => typeof x === "string"))) {
    throw new Error("Pastas permitidas inválidas.");
  }
  for (const key of ["privateMode", "runInBackground", "memoryEnabled", "memoryAskBeforeSave"]) {
    if (patch[key] !== undefined) requireBoolean(patch[key], key);
  }
  if (patch.embeddingModel !== undefined) requireString(patch.embeddingModel, "Modelo de embeddings");
  if (patch.documentMaxSizeMb !== undefined && (!Number.isInteger(patch.documentMaxSizeMb) || Number(patch.documentMaxSizeMb) < 1 || Number(patch.documentMaxSizeMb) > 500)) throw new Error("Limite de documento inválido.");
  if (patch.externalDataRetention !== undefined && !["session", "local"].includes(String(patch.externalDataRetention))) throw new Error("Retenção externa inválida.");
  for (const key of ["connectionsEnabled", "ocrEnabled"]) if (patch[key] !== undefined) requireBoolean(patch[key], key);
  return patch;
}

function validateAutomation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Automação inválida.");
  const data = value as Record<string, unknown>;
  requireString(data.name, "Nome da automação");
  requireString(data.command, "Comando da automação");
  if (data.triggerType !== "cron" && data.triggerType !== "file-created") throw new Error("Tipo de gatilho inválido.");
  requireBoolean(data.enabled, "Status da automação");
  if (data.triggerType === "cron") requireString(data.schedule, "Agendamento");
  if (data.triggerType === "file-created") requireString(data.watchPath, "Pasta monitorada");
  return data;
}

export function registerIpc(
  core: NexoCore,
  desktop: {
    chooseFolder: () => Promise<string | null>;
    chooseDocument: () => Promise<string | null>;
    saveDocument: (name: string) => Promise<string | null>;
    openPath: (p: string) => Promise<string>;
    openExternal: (u: string) => Promise<void>;
    trashItem: (p: string) => Promise<void>;
  }
) {
  ipcMain.handle("nexo:chat", (_, text) => core.chat(requireString(text, "Mensagem")));
  ipcMain.handle("nexo:chat:start", (_, text, attachmentIds) => {
    if (attachmentIds !== undefined && (!Array.isArray(attachmentIds) || !attachmentIds.every(id => typeof id === "string"))) throw new Error("Anexos inválidos.");
    return core.startChatTask(requireString(text, "Mensagem"), attachmentIds ?? []);
  });
  ipcMain.handle("nexo:connections:list", () => core.connections.list());
  ipcMain.handle("nexo:connections:connect", (_, provider, capabilities) => {
    if (provider !== "google" && provider !== "microsoft") throw new Error("Provedor inválido.");
    if (!Array.isArray(capabilities) || !capabilities.every(x => ["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"].includes(x))) throw new Error("Capacidades inválidas.");
    return core.connections.connect(provider, capabilities);
  });
  ipcMain.handle("nexo:connections:disconnect", (_, id) => core.connections.disconnect(requireString(id, "ID da conexão")));
  ipcMain.handle("nexo:connections:test", (_, id) => core.connections.test(requireString(id, "ID da conexão")));
  ipcMain.handle("nexo:connections:add-capabilities", (_, id, capabilities) => core.connections.addCapabilities(requireString(id, "ID da conexão"), capabilities));
  ipcMain.handle("nexo:documents:choose", async () => { const file = await desktop.chooseDocument(); return file ? core.startDocumentImport(file) : null; });
  ipcMain.handle("nexo:documents:list-recent", () => core.documents.listRecent());
  ipcMain.handle("nexo:documents:get", (_, id) => core.documents.get(requireString(id, "ID do documento")));
  ipcMain.handle("nexo:documents:preview", async (_, id) => desktop.openPath(await core.previewDocument(requireString(id, "ID do documento"))));
  ipcMain.handle("nexo:documents:preview-data", (_, id) => core.documentPreviewData(requireString(id, "ID do documento")));
  ipcMain.handle("nexo:documents:export", async (_, id) => { const documentId=requireString(id,"ID do documento"); const document=core.documents.get(documentId); if(!document) throw new Error("Documento não encontrado."); const target=await desktop.saveDocument(document.name); return target ? core.exportDocument(documentId,target) : {ok:false}; });
  ipcMain.handle("nexo:documents:edit", (_, id, plan) => core.editDocument(requireString(id, "ID do documento"), plan));
  ipcMain.handle("nexo:chat:history", () => core.listChatMessages());
  ipcMain.handle("nexo:tasks:list", (_, limit) => core.listTasks(Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50));
  ipcMain.handle("nexo:tasks:active", () => core.listActiveTasks());
  ipcMain.handle("nexo:task:get", (_, id) => core.getTask(requireString(id, "ID da tarefa")));
  ipcMain.handle("nexo:status", () => core.status());
  ipcMain.handle("nexo:settings:get", () => core.getSettings());
  ipcMain.handle("nexo:settings:update", (_, patch) => core.updateSettings(validateSettingsPatch(patch)));
  ipcMain.handle("nexo:approvals:list", () => core.approvals.list());
  ipcMain.handle("nexo:approvals:resolve", (_, id, approved) => core.approve(requireString(id, "ID da aprovação"), requireBoolean(approved, "Aprovação")));
  ipcMain.handle("nexo:audit:list", () => core.audit.list());
  ipcMain.handle("nexo:memory:list", () => core.memory.listByCategory());
  ipcMain.handle("nexo:memory:add", (_, key, value, category) => core.addMemory(requireString(key, "Chave"), requireString(value, "Valor"), category === undefined ? undefined : requireString(category, "Categoria")));
  ipcMain.handle("nexo:memory:search", (_, query) => core.memory.search(requireString(query, "Busca")));
  ipcMain.handle("nexo:memory:remove", (_, key) => core.memory.remove(requireString(key, "Chave")));
  ipcMain.handle("nexo:memory:clear", () => core.clearMemory());
  ipcMain.handle("nexo:automation:list", () => core.automation.list());
  ipcMain.handle("nexo:automation:create", (_, data) => core.automation.create(validateAutomation(data) as any));
  ipcMain.handle("nexo:automation:toggle", (_, id, enabled) => core.automation.setEnabled(requireString(id, "ID da automação"), requireBoolean(enabled, "Status")));
  ipcMain.handle("nexo:automation:remove", (_, id) => core.automation.remove(requireString(id, "ID da automação")));
  ipcMain.handle("nexo:choose-folder", () => desktop.chooseFolder());
  ipcMain.handle("nexo:open-path", (_, p) => {
    const target = requireString(p, "Caminho");
    core.permissions.assertPath(target);
    return desktop.openPath(target);
  });
  ipcMain.handle("nexo:open-external", (_, u) => desktop.openExternal(validateExternalUrl(u)));
  ipcMain.handle("nexo:trash-item", async (_, p) => {
    const target = requireString(p, "Caminho");
    core.permissions.assertPath(target);
    return core.approvals.create("trash_file", { path: target }, "CRITICAL", "Mover item para a lixeira");
  });
  ipcMain.handle("nexo:backup", () => core.backup());
}
