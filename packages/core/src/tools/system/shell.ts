import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";
const execFileAsync=promisify(execFile);

const SAFE_COMMANDS = new Set(["git status","git log --oneline -20","ipconfig","whoami"]);

export function shellTools(): ToolDefinition[] {
  return [{
    name:"shell_readonly", description:"Executa um comando somente-leitura da lista segura", risk:"READ", permissions:["shell.readonly"], pathFields:["cwd"],
    inputSchema:z.object({command:z.string(),cwd:z.string().optional()}),
    async execute({command,cwd}){
      const normalized=command.trim().replace(/\s+/g," ");
      if(!SAFE_COMMANDS.has(normalized)) throw new Error("Comando não permitido no shell somente-leitura.");
      const isWin=process.platform==="win32";
      let file:string,args:string[];
      if(normalized.startsWith("git ")){file="git";args=normalized.split(" ").slice(1);}else if(normalized==="ipconfig"){file=isWin?"ipconfig":"ifconfig";args=[];}else{file=isWin?"whoami":"whoami";args=[];}
      const {stdout,stderr}=await execFileAsync(file,args,{cwd,timeout:15000,windowsHide:true,maxBuffer:1024*1024});
      return {ok:true,summary:`Comando concluído: ${normalized}`,data:{stdout,stderr}};
    }
  }];
}
