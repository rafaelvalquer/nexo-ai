import { randomUUID } from "node:crypto";
import chokidar, { type FSWatcher } from "chokidar";
import { Cron } from "croner";
import type { Automation } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { parseNaturalSchedule } from "./natural-schedule.js";

export class AutomationEngine {
  private cronJobs = new Map<string, Cron>();
  private watchers = new Map<string, FSWatcher>();
  constructor(private db: NexoDatabase, private executeCommand: (command:string)=>Promise<unknown>) {}

  list(): Automation[] { return this.db.all<any>("SELECT * FROM automations ORDER BY created_at DESC").map(r=>({id:r.id,name:r.name,enabled:!!r.enabled,triggerType:r.trigger_type,schedule:r.schedule??undefined,watchPath:r.watch_path??undefined,command:r.command,lastRunAt:r.last_run_at??undefined})); }

  create(input: Omit<Automation,"id"|"lastRunAt">) { const a:Automation={...input,id:randomUUID()}; this.db.run("INSERT INTO automations(id,name,enabled,trigger_type,schedule,watch_path,command,created_at) VALUES(?,?,?,?,?,?,?,?)",[a.id,a.name,a.enabled?1:0,a.triggerType,a.schedule??null,a.watchPath??null,a.command,new Date().toISOString()]); this.install(a); return a; }
  createFromNatural(input: { name:string; when:string; command:string; enabled?:boolean }) { return this.create({ name:input.name, command:input.command, enabled:input.enabled ?? true, triggerType:"cron", schedule:parseNaturalSchedule(input.when) }); }

  setEnabled(id:string,enabled:boolean){this.db.run("UPDATE automations SET enabled=? WHERE id=?",[enabled?1:0,id]);this.uninstall(id);const a=this.list().find(x=>x.id===id);if(a&&enabled)this.install(a);return a;}
  remove(id:string){this.uninstall(id);this.db.run("DELETE FROM automations WHERE id=?",[id]);}
  async runManual(id:string) { const automation=this.list().find(item=>item.id===id); if(!automation) throw new Error("Automação não encontrada."); if(!automation.enabled) throw new Error("Ative a automação antes de executá-la."); await this.run(automation); return automation; }
  start(){for(const a of this.list()) if(a.enabled) this.install(a);}
  stop(){for(const id of [...this.cronJobs.keys(),...this.watchers.keys()])this.uninstall(id);}

  private install(a:Automation){
    this.uninstall(a.id); if(!a.enabled)return;
    const run=()=>void this.run(a);
    if(a.triggerType==="cron"&&a.schedule){this.cronJobs.set(a.id,new Cron(a.schedule,{protect:true},run));}
    if((a.triggerType==="file-created"||a.triggerType==="file-changed")&&a.watchPath){const w=chokidar.watch(a.watchPath,{ignoreInitial:true});w.on(a.triggerType==="file-created"?"add":"change",run);this.watchers.set(a.id,w);}
    if(a.triggerType==="app-start") run();
  }
  private uninstall(id:string){this.cronJobs.get(id)?.stop();this.cronJobs.delete(id);void this.watchers.get(id)?.close();this.watchers.delete(id);}
  private async run(a:Automation) { await this.executeCommand(a.command); this.db.run("UPDATE automations SET last_run_at=? WHERE id=?",[new Date().toISOString(),a.id]); }
}
