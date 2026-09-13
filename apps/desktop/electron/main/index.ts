import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NexoCore, startCoreServer } from "@nexo/core";
import { registerIpc } from "../ipc/register.js";
import { ElectronSecretStore } from "../oauth/secret-store.js";
import { DesktopOAuthHost } from "../oauth/desktop-oauth-host.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDevelopmentEnvironment() {
  if (app.isPackaged) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../..", ".env"),
    path.resolve(__dirname, "../../../../.env")
  ];
  const envFile = candidates.find(candidate => fs.existsSync(candidate));
  if (envFile) process.loadEnvFile(envFile);
}

loadDevelopmentEnvironment();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const core = new NexoCore({ dataDir: process.env.NEXO_DATA_DIR, secretStore: new ElectronSecretStore(), oauthHost: new DesktopOAuthHost() });
let httpServer: any = null;

async function createWindow() {
  await core.ready();
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#0b0d10",
    title: "Nexo AI",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  win.on("close", event => {
    if (!quitting && core.getSettings().runInBackground) {
      event.preventDefault();
      win?.hide();
    }
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) await win.loadURL(dev);
  else await win.loadFile(path.join(__dirname, "../../dist/index.html"));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.resolve(__dirname, "../../resources/icons/icon.png")).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("Nexo AI");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Nexo", click: () => { win?.show(); win?.focus(); } },
    { label: "Modo privado", type: "checkbox", checked: core.getSettings().privateMode, click: item => core.updateSettings({ privateMode: item.checked }) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("double-click", () => win?.show());
}

app.whenReady().then(async () => {
  await core.ready();
  registerIpc(core, {
    chooseFolder: async () => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return result.canceled ? null : result.filePaths[0];
    },
    chooseDocument: async () => {
      const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Documentos", extensions: ["pdf", "docx", "txt", "md"] }] });
      return result.canceled ? null : result.filePaths[0];
    },
    saveDocument: async (name: string) => {
      const result = await dialog.showSaveDialog({ defaultPath: name });
      return result.canceled ? null : result.filePath ?? null;
    },
    openPath: (target: string) => shell.openPath(target),
    openExternal: (url: string) => shell.openExternal(url),
    trashItem: (target: string) => shell.trashItem(target)
  });
  httpServer = await startCoreServer(Number(process.env.NEXO_CORE_PORT ?? 47321));
  await createWindow();
  createTray();
  if (app.isPackaged) void import("../updater/index.js").then(({ configureUpdater }) => configureUpdater(true));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    else win?.show();
  });
}).catch(error => {
  console.error("Nexo AI startup failed", error);
  app.exit(1);
});

app.on("before-quit", () => {
  quitting = true;
  core.shutdown();
  void httpServer?.close?.();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !core.getSettings().runInBackground) app.quit();
});
