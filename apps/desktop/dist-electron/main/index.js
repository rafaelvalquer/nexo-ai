import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NexoCore, startCoreServer } from "@nexo/core";
import { registerIpc } from "../ipc/register.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;
let tray = null;
let quitting = false;
const core = new NexoCore();
let httpServer = null;
async function createWindow() {
    await core.ready();
    win = new BrowserWindow({ width: 1360, height: 860, minWidth: 1050, minHeight: 700, backgroundColor: "#0b0d10", title: "Nexo AI", webPreferences: { preload: path.join(__dirname, "../preload/index.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.on("close", e => { if (!quitting && core.getSettings().runInBackground) {
        e.preventDefault();
        win?.hide();
    } });
    const dev = process.env.VITE_DEV_SERVER_URL;
    if (dev)
        await win.loadURL(dev);
    else
        await win.loadFile(path.join(__dirname, "../../dist/index.html"));
}
function createTray() {
    const icon = nativeImage.createFromDataURL("data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#6d5dfc"/><text x="16" y="22" text-anchor="middle" font-size="18" font-family="Arial" fill="white">N</text></svg>`).toString("base64"));
    tray = new Tray(icon);
    tray.setToolTip("Nexo AI");
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: "Abrir Nexo", click: () => { win?.show(); win?.focus(); } },
        { label: "Modo privado", type: "checkbox", checked: core.getSettings().privateMode, click: item => core.updateSettings({ privateMode: item.checked }) },
        { type: "separator" }, { label: "Sair", click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on("double-click", () => win?.show());
}
app.whenReady().then(async () => {
    registerIpc(core, { chooseFolder: async () => { const r = await dialog.showOpenDialog({ properties: ["openDirectory"] }); return r.canceled ? null : r.filePaths[0]; }, openPath: (p) => shell.openPath(p), openExternal: (u) => shell.openExternal(u), trashItem: (p) => shell.trashItem(p) });
    httpServer = await startCoreServer(Number(process.env.NEXO_CORE_PORT ?? 47321));
    await createWindow();
    createTray();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0)
        void createWindow();
    else
        win?.show(); });
});
app.on("before-quit", () => { quitting = true; core.shutdown(); void httpServer?.close?.(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin" && !core.getSettings().runInBackground)
    app.quit(); });
