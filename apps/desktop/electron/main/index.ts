import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NexoCore, startCoreServer } from "@nexo/core";
import { registerIpc } from "../ipc/register.js";
import { registerClarificationIpc } from "../ipc/clarification.js";
import { registerAutomationV2Ipc } from "../ipc/automation-v2.js";
import { registerEmailDraftIpc } from "../ipc/email-draft.js";
import { ElectronSecretStore } from "../oauth/secret-store.js";
import { DesktopOAuthHost } from "../oauth/desktop-oauth-host.js";
import { createDesktopStoragePaths,migrateLegacySecrets } from "../storage/storage-paths.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const envCandidates=[path.resolve(process.cwd(),".env"),path.resolve(process.cwd(),"../../.env")];
if(!app.isPackaged){for(const candidate of envCandidates){if(fs.existsSync(candidate)){process.loadEnvFile(candidate);break;}}}
const storage=createDesktopStoragePaths();
let win:BrowserWindow|null=null;
let tray:Tray|null=null;
let quitting=false;
const core=new NexoCore({dataDir:storage.root,secretStore:new ElectronSecretStore(storage.secrets),oauthHost:new DesktopOAuthHost()});
let httpServer:any=null;
let browserAgentRuntime:ReturnType<typeof registerBrowserAgentIpc>|undefined;

async function createWindow(){
  await core.ready();
  win=new BrowserWindow({width:1360,height:860,minWidth:1050,minHeight:700,backgroundColor:"#0b0d10",title:"Nexo AI",webPreferences:{preload:path.join(__dirname,"../preload/index.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.on("close",e=>{if(!quitting&&core.getSettings().runInBackground){e.preventDefault();win?.hide();}});
  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev)await win.loadURL(dev);else await win.loadFile(path.join(__dirname,"../../dist/index.html"));
}

function createTray(){
  const icon=nativeImage.createFromPath(path.resolve(__dirname,"../../resources/icons/icon.png")).resize({width:32,height:32});tray=new Tray(icon);tray.setToolTip("Nexo AI");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Nexo", click: () => { win?.show(); win?.focus(); } },
    { label: "Modo privado", type: "checkbox", checked: core.getSettings().privateMode, click: item => core.updateSettings({ privateMode: item.checked }) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("double-click", () => win?.show());
}

app.whenReady().then(async()=>{
  migrateLegacySecrets(storage.secrets,[path.join(app.getPath("userData"),"secrets.enc.json")]);
  await core.ready();
  await core.connections.restoreConnections();
  registerIpc(core,{chooseFolder:async()=>{const r=await dialog.showOpenDialog({properties:["openDirectory"]});return r.canceled?null:r.filePaths[0]},chooseDocument:async()=>{const r=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Documentos",extensions:["pdf","docx","txt","md"]}]});return r.canceled?null:r.filePaths[0]},saveDocument:async(name:string)=>{const r=await dialog.showSaveDialog({defaultPath:name});return r.canceled?null:r.filePath??null},openPath:(p:string)=>shell.openPath(p),openExternal:(u:string)=>shell.openExternal(u),trashItem:(p:string)=>shell.trashItem(p)});
  registerClarificationIpc(core);
  registerEmailDraftIpc(core);
  registerAutomationV2Ipc(core);
  browserAgentRuntime=registerBrowserAgentIpc(core,{dataDir:storage.root,workerEntry:path.join(__dirname,"../browser-agent-worker.js")});
  httpServer=await startCoreServer(Number(process.env.NEXO_CORE_PORT??47321));
  await createWindow();createTray();
  setTimeout(()=>{for(const account of core.connections.list().filter(item=>item.status==="connected"))void core.connections.test(account.id).catch(()=>undefined);},1500).unref?.();
  if(app.isPackaged)void import("../updater/index.js").then(({configureUpdater})=>configureUpdater(true));
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();else win?.show();});
}).catch(error=>{console.error("Nexo AI startup failed",error);app.exit(1);});
app.on("before-quit",()=>{quitting=true;void browserAgentRuntime?.shutdown();core.shutdown();void httpServer?.close?.();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin"&&!core.getSettings().runInBackground)app.quit();});
