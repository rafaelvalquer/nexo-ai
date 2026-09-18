import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell, Notification } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NexoCore, startCoreServer } from "@nexo/core";
import { registerIpc } from "../ipc/register.js";
import { registerClarificationIpc } from "../ipc/clarification.js";
import { registerAutomationV2Ipc } from "../ipc/automation-v2.js";
import { registerEmailDraftIpc } from "../ipc/email-draft.js";
import { registerBrowserAgentIpc } from "../browser-agent-ipc.js";
import { ElectronSecretStore } from "../oauth/secret-store.js";
import { DesktopOAuthHost } from "../oauth/desktop-oauth-host.js";
import { createDesktopStoragePaths,migrateLegacySecrets } from "../storage/storage-paths.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
function smokeProgress(stage:string){const file=process.env.NEXO_SMOKE_STAGE_FILE;if(!file)return;try{fs.appendFileSync(path.resolve(file),`${new Date().toISOString()} ${stage}\n`);}catch{}}
smokeProgress("main-module-loaded");
const envCandidates=[path.resolve(process.cwd(),".env"),path.resolve(process.cwd(),"../../.env")];
if(!app.isPackaged){for(const candidate of envCandidates){if(fs.existsSync(candidate)){process.loadEnvFile(candidate);break;}}}
configureSystemLocations();
const storage=createDesktopStoragePaths();
let win:BrowserWindow|null=null;
let tray:Tray|null=null;
let quitting=false;
const core=new NexoCore({dataDir:storage.root,secretStore:new ElectronSecretStore(storage.secrets),oauthHost:new DesktopOAuthHost(),notify:(title,body)=>{if(Notification.isSupported())new Notification({title,body}).show();}});
smokeProgress("core-constructed");
let httpServer:any=null;
let browserAgentRuntime:Awaited<ReturnType<typeof registerBrowserAgentIpc>>|undefined;

function configureSystemLocations(){
  process.env.NEXO_SYSTEM_HOME??=app.getPath("home");
  process.env.NEXO_SYSTEM_DOWNLOADS??=app.getPath("downloads");
  process.env.NEXO_SYSTEM_DOCUMENTS??=app.getPath("documents");
  process.env.NEXO_SYSTEM_DESKTOP??=app.getPath("desktop");
  process.env.NEXO_SYSTEM_PICTURES??=app.getPath("pictures");
  process.env.NEXO_SYSTEM_VIDEOS??=app.getPath("videos");
  process.env.NEXO_SYSTEM_MUSIC??=app.getPath("music");
}

async function createWindow(){
  await core.ready();
  win=new BrowserWindow({width:1360,height:860,minWidth:1050,minHeight:700,backgroundColor:"#0b0d10",title:"Nexo AI",webPreferences:{preload:path.join(__dirname,"../preload/index.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.on("close",e=>{if(!quitting&&core.getSettings().runInBackground){e.preventDefault();win?.hide();}});
  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev)await win.loadURL(dev);else await win.loadFile(path.join(__dirname,"../../dist/index.html"));
}

function reportStartupFailure(error:unknown){
  const detail=error instanceof Error?error.stack??error.message:String(error);
  try{fs.mkdirSync(storage.logs,{recursive:true});fs.appendFileSync(path.join(storage.logs,"startup-errors.log"),`[${new Date().toISOString()}] ${detail}\n`);}catch{}
  console.error("Nexo AI startup failed",error);app.exit(1);
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
  smokeProgress("electron-ready");
  migrateLegacySecrets(storage.secrets,[path.join(app.getPath("userData"),"secrets.enc.json")]);
  smokeProgress("before-core-ready");
  await core.ready();
  smokeProgress("core-ready");
  if(core.getSettings().connectionsEnabled)await (await core.ensureConnections()).restoreConnections();
  smokeProgress("connections-restored");
  registerIpc(core,{chooseFolder:async()=>{const r=await dialog.showOpenDialog({properties:["openDirectory"]});return r.canceled?null:r.filePaths[0]},chooseDocument:async()=>{const r=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Documentos",extensions:["pdf","docx","txt","md"]}]});return r.canceled?null:r.filePaths[0]},saveDocument:async(name:string)=>{const r=await dialog.showSaveDialog({defaultPath:name});return r.canceled?null:r.filePath??null},openPath:(p:string)=>shell.openPath(p),openExternal:(u:string)=>shell.openExternal(u),trashItem:(p:string)=>shell.trashItem(p)});
  registerClarificationIpc(core);
  registerEmailDraftIpc(core);
  registerAutomationV2Ipc(core);
  browserAgentRuntime=await registerBrowserAgentIpc(core,{dataDir:storage.root,workerEntry:path.join(__dirname,"../browser-agent-worker.js")}).catch(error=>{console.warn("Browser Agent module unavailable; continuing without it.",error);return undefined;});
  smokeProgress("ipc-registered");
  httpServer=await startCoreServer(Number(process.env.NEXO_CORE_PORT??47321));
  smokeProgress("core-server-started");
  await createWindow();createTray();
  smokeProgress("window-created");
  if(process.env.NEXO_SMOKE_READY_FILE){const readyFile=path.resolve(process.env.NEXO_SMOKE_READY_FILE);fs.mkdirSync(path.dirname(readyFile),{recursive:true});fs.writeFileSync(readyFile,JSON.stringify({readyAt:new Date().toISOString(),dataDir:storage.root,database:storage.database,windowLoaded:Boolean(win&&!win.isDestroyed())}));}
  if(core.getSettings().connectionsEnabled)setTimeout(()=>{void core.ensureConnections().then(connections=>Promise.all(connections.list().filter(item=>item.status==="connected").map(account=>connections.test(account.id).catch(()=>undefined))));},1500).unref?.();
  if(app.isPackaged)void import("../updater/index.js").then(({configureUpdater})=>configureUpdater(true));
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();else win?.show();});
}).catch(reportStartupFailure);
app.on("before-quit",()=>{quitting=true;void browserAgentRuntime?.shutdown();core.shutdown();void httpServer?.close?.();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin"&&!core.getSettings().runInBackground)app.quit();});
