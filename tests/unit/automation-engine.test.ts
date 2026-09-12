import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AutomationEngine } from "../../packages/core/src/automation/engine.js";

let root: string; let db: NexoDatabase;
beforeEach(async () => { root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-automation-")); db=new NexoDatabase(root); await db.ready(); });
afterEach(() => fs.rmSync(root,{recursive:true,force:true}));

describe("AutomationEngine triggers", () => {
  it("runs an enabled manual automation only when explicitly requested", async () => {
    const calls:string[]=[]; const engine=new AutomationEngine(db,async command=>{calls.push(command);});
    const automation=engine.create({name:"Manual",enabled:true,triggerType:"manual",command:"verificar"});
    expect(calls).toEqual([]); await engine.runManual(automation.id); expect(calls).toEqual(["verificar"]);
    expect(engine.list()[0].lastRunAt).toBeTruthy();
  });
  it("runs enabled app-start automation during startup", async () => {
    const calls:string[]=[]; const engine=new AutomationEngine(db,async command=>{calls.push(command);});
    engine.create({name:"Início",enabled:true,triggerType:"app-start",command:"iniciar"});
    await new Promise(resolve=>setTimeout(resolve,0)); expect(calls).toEqual(["iniciar"]); engine.stop();
  });
});
