import fs from "node:fs";
import path from "node:path";
import open, { openApp } from "open";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";

function resolveApplication(name:string) {
  const key=name.trim().toLowerCase();
  const local=process.env.LOCALAPPDATA ?? "";
  const candidates:Record<string,string[]>={
    "chrome":["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",path.join(local,"Google","Chrome","Application","chrome.exe"),"chrome"],
    "google chrome":["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",path.join(local,"Google","Chrome","Application","chrome.exe"),"chrome"],
    "edge":["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe","msedge"],
    "microsoft edge":["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe","msedge"],
    "vscode":[path.join(local,"Programs","Microsoft VS Code","Code.exe"),"code"],
    "visual studio code":[path.join(local,"Programs","Microsoft VS Code","Code.exe"),"code"],
    "android studio":["C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe","studio64"],
    "explorer":["explorer"]
  };
  const list=candidates[key];
  if(!list) return null;
  return list.find(v=>v.includes("\\") ? fs.existsSync(v) : true) ?? null;
}

export function applicationTools(): ToolDefinition[] {
  return [
    {
      name:"open_url", description:"Abre uma URL pública no navegador padrão", domain:"browser", operation:"open_url", exposure:"PUBLIC_AGENT_TOOL", risk:"READ", mutatesState:false,permissions:["system.open"],
      inputSchema:z.object({url:z.string().url()}), async execute({url}){await open(url);return {ok:true,summary:`URL aberta: ${url}`};}
    },
    {
      name:"open_path", description:"Abre arquivo ou pasta autorizado com o aplicativo padrão", domain:"filesystem", operation:"open_path", exposure:"PUBLIC_AGENT_TOOL", risk:"READ", mutatesState:false,permissions:["system.open"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:target}){await open(target);return {ok:true,summary:`Aberto: ${target}`};}
    },
    {
      name:"open_application", description:"Abre um aplicativo permitido", domain:"system", operation:"open_application", exposure:"PUBLIC_AGENT_TOOL", risk:"READ", mutatesState:false,permissions:["system.open"],
      inputSchema:z.object({application:z.string()}), async execute({application}){const target=resolveApplication(application);if(!target)throw new Error(`Aplicativo não permitido ou não encontrado: ${application}`);await openApp(target);return {ok:true,summary:`Aplicativo aberto: ${application}`};}
    }
  ];
}
