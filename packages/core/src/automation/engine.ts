import { randomUUID } from "node:crypto";
import chokidar, { type FSWatcher } from "chokidar";
import { Cron } from "croner";
import type { Automation } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";

export class AutomationEngine {
  private cronJobs = new Map<string, Cron>();
  private watchers = new Map<string, FSWatcher>();
  constructor(private db: NexoDatabase, private executeCommand: (command:string)=>Promise<unknown>) {}

  list(): Automation[] { return this.db.all<any>("SELECT * FROM automations ORDER BY created_at DESC").map(r=>({id:r.id,name:r.name,enabled:!!r.enabled,triggerType:r.trigger_type,schedule:r.schedule??undefined,watchPath:r.watch_path??undefined,command:r.command,lastRunAt:r.last_run_at??undefined})); }

  create(input: Omit<Automation,"id"|"lastRunAt">) { const a:Automation={...input,id:randomUUID()}; this.db.run("INSERT INTO automations(id,name,enabled,trigger_type,schedule,watch_path,command,created_at) VALUES(?,?,?,?,?,?,?,?)",[a.id,a.name,a.enabled?1:0,a.triggerType,a.schedule??null,a.watchPath??null,a.command,new Date().toISOString()]); this.install(a); return a; }

  setEnabled(id:string,enabled:boolean){this.db.run("UPDATE automations SET enabled=? WHERE id=?",[enabled?1:0,id]);this.uninstall(id);const a=this.list().find(x=>x.id===id);if(a&&enabled)this.install(a);return a;}
  remove(id:string){this.uninstall(id);this.db.run("DELETE FROM automations WHERE id=?",[id]);}
  start(){for(const a of this.list()) if(a.enabled) this.install(a);}
  stop(){for(const id of [...this.cronJobs.keys(),...this.watchers.keys()])this.uninstall(id);}

  private install(a:Automation){
    this.uninstall(a.id); if(!a.enabled)return;
    const run=async()=>{await this.executeCommand(a.command);this.db.run("UPDATE automations SET last_run_at=? WHERE id=?",[new Date().toISOString(),a.id]);};
    if(a.triggerType==="cron"&&a.schedule){this.cronJobs.set(a.id,new Cron(a.schedule,{protect:true},()=>void run()));}
    if(a.triggerType==="file-created"&&a.watchPath){const w=chokidar.watch(a.watchPath,{ignoreInitial:true});w.on("add",()=>void run());this.watchers.set(a.id,w);}
  }
  private uninstall(id:string){this.cronJobs.get(id)?.stop();this.cronJobs.delete(id);void this.watchers.get(id)?.close();this.watchers.delete(id);}
}
