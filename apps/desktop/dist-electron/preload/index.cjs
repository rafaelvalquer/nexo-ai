"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    chat: (text) => electron_1.ipcRenderer.invoke("nexo:chat", text),
    startChatTask: (text) => electron_1.ipcRenderer.invoke("nexo:chat:start", text),
    chatHistory: () => electron_1.ipcRenderer.invoke("nexo:chat:history"),
    listTasks: (limit = 50) => electron_1.ipcRenderer.invoke("nexo:tasks:list", limit),
    listActiveTasks: () => electron_1.ipcRenderer.invoke("nexo:tasks:active"),
    getTask: (id) => electron_1.ipcRenderer.invoke("nexo:task:get", id),
    status: () => electron_1.ipcRenderer.invoke("nexo:status"),
    getSettings: () => electron_1.ipcRenderer.invoke("nexo:settings:get"),
    updateSettings: (patch) => electron_1.ipcRenderer.invoke("nexo:settings:update", patch),
    listApprovals: () => electron_1.ipcRenderer.invoke("nexo:approvals:list"),
    resolveApproval: (id, approved) => electron_1.ipcRenderer.invoke("nexo:approvals:resolve", id, approved),
    listAudit: () => electron_1.ipcRenderer.invoke("nexo:audit:list"),
    listMemories: () => electron_1.ipcRenderer.invoke("nexo:memory:list"),
    addMemory: (key, value, category) => electron_1.ipcRenderer.invoke("nexo:memory:add", key, value, category),
    searchMemory: (query) => electron_1.ipcRenderer.invoke("nexo:memory:search", query),
    removeMemory: (key) => electron_1.ipcRenderer.invoke("nexo:memory:remove", key),
    listAutomations: () => electron_1.ipcRenderer.invoke("nexo:automation:list"),
    createAutomation: (data) => electron_1.ipcRenderer.invoke("nexo:automation:create", data),
    toggleAutomation: (id, enabled) => electron_1.ipcRenderer.invoke("nexo:automation:toggle", id, enabled),
    removeAutomation: (id) => electron_1.ipcRenderer.invoke("nexo:automation:remove", id),
    chooseFolder: () => electron_1.ipcRenderer.invoke("nexo:choose-folder"),
    openPath: (path) => electron_1.ipcRenderer.invoke("nexo:open-path", path),
    openExternal: (url) => electron_1.ipcRenderer.invoke("nexo:open-external", url),
    trashItem: (path) => electron_1.ipcRenderer.invoke("nexo:trash-item", path),
    backup: () => electron_1.ipcRenderer.invoke("nexo:backup")
};
electron_1.contextBridge.exposeInMainWorld("nexo", api);
