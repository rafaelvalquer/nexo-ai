import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AutomationEngine } from "../../packages/core/src/automation/engine.js";
import { resolveConfig } from "../../packages/core/src/automation/actions/executor.js";

let root: string; let db: NexoDatabase;
beforeEach(async () => { root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-automation-")); db=new NexoDatabase(root); await db.ready(); });
afterEach(() => fs.rmSync(root,{recursive:true,force:true}));

describe("AutomationEngine triggers", () => {
  it("resolves macro variables in action configuration",()=>{
    const context={automationId:"a",runId:"r",trigger:{type:"manual",data:{}},actionResults:{first:{summary:"relatório pronto"}},startedAt:new Date().toISOString()};
    const config=resolveConfig({path:"{{downloads}}\\{{today}}.txt",content:"{{macro.output}}"},context);
    expect(config.path).toContain("Downloads");expect(config.path).toMatch(/\d{4}-\d{2}-\d{2}\.txt$/);expect(config.content).toBe("relatório pronto");
    expect(()=>resolveConfig({value:"{{missing}}"},context)).toThrow("Variável de macro desconhecida");
  });
  it("skips a macro step whose per-step condition is false",async()=>{
    const calls:string[]=[];const engine=new AutomationEngine(db,async command=>{calls.push(command);});
    const automation=engine.create({name:"Condição",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"conditional",type:"nexo.command",config:{command:"não executar"},condition:{id:"c",field:"$trigger.data.allowed",operator:"equals",value:true}},{id:"next",type:"nexo.command",config:{command:"executar"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    await engine.runManual(automation.id);expect(calls).toEqual(["executar"]);expect(engine.listRuns(automation.id)[0].status).toBe("success");
  });
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
  it("cancels a running macro step and records the cancelled run",async()=>{
    const engine=new AutomationEngine(db,async()=>{});const automation=engine.create({name:"Aguardar",description:"teste",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"wait",type:"system.wait",config:{seconds:30}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    const run=engine.runManual(automation.id);await new Promise(resolve=>setTimeout(resolve,20));expect(engine.cancel(automation.id)).toBe(true);await run;
    expect(engine.listRuns(automation.id)[0].status).toBe("cancelled");
  });
  it("retries the exact failed macro step and then continues with later steps",async()=>{
    const calls:string[]=[];const engine=new AutomationEngine(db,async command=>{calls.push(command);if(command==="first"&&calls.filter(item=>item==="first").length===1)throw new Error("permanent failure");});const automation=engine.create({name:"Retry",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"first",type:"nexo.command",config:{command:"first"}},{id:"second",type:"nexo.command",config:{command:"second"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    await engine.runManual(automation.id);const failed=engine.listRuns(automation.id)[0];expect(failed.status).toBe("failed");expect(engine.getRun(failed.id)?.steps?.[0].status).toBe("failed");
    const resumed=await engine.resumeFailedRun(failed.id,"retry");expect(resumed.status).toBe("success");expect(calls).toEqual(["first","first","second"]);expect(resumed.steps?.filter(step=>step.ordinal===1)).toHaveLength(2);
  });
  it("continues after the failed step only when explicitly requested",async()=>{
    const calls:string[]=[];const engine=new AutomationEngine(db,async command=>{calls.push(command);if(command==="bad")throw new Error("permanent failure");});const automation=engine.create({name:"Continue",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"bad",type:"nexo.command",config:{command:"bad"}},{id:"after",type:"nexo.command",config:{command:"after"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    await engine.runManual(automation.id);const failed=engine.listRuns(automation.id)[0];const resumed=await engine.resumeFailedRun(failed.id,"continue");expect(resumed.status).toBe("success");expect(calls).toEqual(["bad","after"]);expect(resumed.steps?.[0].status).toBe("skipped");
  });
  it("delivers macro notification actions through the desktop notification adapter",async()=>{
    const notifications:Array<[string,string]>=[];const engine=new AutomationEngine(db,async()=>{},undefined,undefined,(title,body)=>notifications.push([title,body]));const macro=engine.create({name:"Avisar",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"notify",type:"notification.show",config:{title:"Relatório pronto",content:"Arquivo salvo."}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    await engine.runManual(macro.id);expect(notifications).toEqual([["Relatório pronto","Arquivo salvo."]]);
  });
  it("tests a saved macro as a dry run without launching apps or showing notifications",async()=>{
    const execute=vi.fn(async(command:string)=>({ok:true,summary:command})),notifications:Array<[string,string]>=[],engine=new AutomationEngine(db,execute,undefined,undefined,(title,body)=>notifications.push([title,body]));
    const macro=engine.create({name:"Simular",enabled:false,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"app",type:"system.open_application",config:{application:"chrome"}},{id:"notify",type:"notification.show",config:{title:"Pronto",content:"Concluído"}},{id:"free",type:"nexo.command",config:{command:"abrir outro app"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:false,count:0},onRepeatedFailure:"continue"}} as any);
    const run=await engine.test(macro.id);expect(run).toMatchObject({status:"success"});expect(execute).not.toHaveBeenCalled();expect(notifications).toEqual([]);
  });
  it("retries transient failures for idempotent reads only",async()=>{
    const readCalls:string[]=[],readEngine=new AutomationEngine(db,async command=>{readCalls.push(command);if(readCalls.length===1)throw new Error("temporary network timeout");return{ok:true,summary:"Página lida"};});const readMacro=readEngine.create({name:"Leitura com retry",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"read",type:"web.fetch",config:{url:"https://example.com"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:true,count:2},onRepeatedFailure:"continue"}} as any);
    await readEngine.runManual(readMacro.id);expect(readCalls).toHaveLength(2);expect(readEngine.listRuns(readMacro.id)[0].status).toBe("success");
    const downloadCalls:string[]=[],downloadEngine=new AutomationEngine(db,async command=>{downloadCalls.push(command);throw new Error("network timeout after dispatch");});const downloadMacro=downloadEngine.create({name:"Download sem retry",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:[{id:"download",type:"browser.download",config:{selector:"#file",path:"C:\\Reports\\report.csv"}}],output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:true,count:2},onRepeatedFailure:"continue"}} as any);
    await downloadEngine.runManual(downloadMacro.id);expect(downloadCalls).toHaveLength(1);expect(downloadEngine.listRuns(downloadMacro.id)[0].status).toBe("failed");
  });
});
