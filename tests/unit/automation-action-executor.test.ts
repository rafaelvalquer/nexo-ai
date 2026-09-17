import { describe, expect, it, vi } from "vitest";
import { AutomationActionExecutor } from "../../packages/core/src/automation/actions/executor.js";
import { AUTOMATION_ACTION_CATALOG } from "../../packages/core/src/automation/actions/catalog.js";

const context = { automationId:"macro-1",runId:"run-1",trigger:{type:"manual",data:{}},actionResults:{},startedAt:new Date().toISOString() };

describe("macro action catalog", () => {
  it("offers deterministic desktop steps and a bounded wait", () => {
    const ids = AUTOMATION_ACTION_CATALOG.map(action => action.id);
    expect(ids).toEqual(expect.arrayContaining(["system.open_application","filesystem.open_path","filesystem.copy","filesystem.rename","filesystem.create_folder","browser.open_url","browser.download","browser.click","browser.input","web.search","web.fetch","system.wait"]));
  });

  it("routes public search and page reading through deterministic Web Reader commands",async()=>{
    const execute=vi.fn(async(command:string)=>({ok:true,summary:command})),runner=new AutomationActionExecutor(execute);
    await runner.execute({id:"search",type:"web.search",config:{query:"React 20"}},context);
    await runner.execute({id:"read",type:"web.fetch",config:{url:"https://example.com/article"}},context);
    expect(execute.mock.calls.map(call=>call[0])).toEqual(["Pesquise na web React 20",'Leia e resuma a página "https://example.com/article"']);
  });

  it("routes open-app steps as explicit commands and validates wait duration", async () => {
    const execute = vi.fn(async (command:string) => ({ok:true,summary:command}));
    const runner = new AutomationActionExecutor(execute);
    const result = await runner.execute({id:"open",type:"system.open_application",config:{application:"vscode"}},context);
    expect(execute).toHaveBeenCalledWith("Abra o aplicativo vscode",undefined);
    expect(result.value).toMatchObject({ok:true});
    await expect(runner.execute({id:"wait",type:"system.wait",config:{seconds:301}},context)).rejects.toThrow("entre 0 e 300");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("requires approval-backed execution for browser downloads and previews them in dry-run",async()=>{
    const execute=vi.fn(async(command:string)=>({ok:true,summary:command})),runner=new AutomationActionExecutor(execute),action={id:"download",type:"browser.download",config:{selector:"#report",path:"C:\\Reports\\report.csv"}};
    await runner.execute(action,context);
    expect(execute).toHaveBeenCalledWith(`[[NEXO_TOOL:browser_download]] ${JSON.stringify({selector:"#report",path:"C:\\Reports\\report.csv"})}`,undefined);
    const preview=await runner.execute(action,{...context,trigger:{type:"manual",data:{dryRun:true}}});expect(preview.value).toMatchObject({dryRun:true});expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps filesystem writes simulated during a dry run", async () => {
    const execute = vi.fn(async () => ({ok:true}));
    const runner = new AutomationActionExecutor(execute);
    const result = await runner.execute({id:"copy",type:"filesystem.copy",config:{source:"C:\\in.txt",destination:"C:\\out.txt"}},{...context,trigger:{type:"manual",data:{dryRun:true}}});
    expect(result.value).toMatchObject({dryRun:true});
    expect(execute).not.toHaveBeenCalled();
  });

  it("routes explicit browser click and input steps without asking the LLM",async()=>{
    const execute=vi.fn(async(command:string)=>({ok:true,summary:command})),runner=new AutomationActionExecutor(execute);
    await runner.execute({id:"click",type:"browser.click",config:{selector:"#continue"}},context);
    await runner.execute({id:"input",type:"browser.input",config:{selector:"input[name=email]",text:"user@example.com"}},context);
    expect(execute.mock.calls.map(call=>call[0])).toEqual([
      `[[NEXO_TOOL:browser_click]] ${JSON.stringify({selector:"#continue"})}`,
      `[[NEXO_TOOL:browser_type]] ${JSON.stringify({selector:"input[name=email]",text:"user@example.com"})}`
    ]);
  });

  it("does not dispatch browser, notification, or free-form steps during dry-run",async()=>{
    const execute=vi.fn(async()=>({ok:true})),runner=new AutomationActionExecutor(execute),dry={...context,trigger:{type:"manual",data:{dryRun:true}}};
    for(const action of [
      {id:"open",type:"browser.open",config:{url:"https://example.com"}},
      {id:"click",type:"browser.click",config:{selector:"#submit"}},
      {id:"input",type:"browser.input",config:{selector:"input",text:"value"}},
      {id:"command",type:"nexo.command",config:{command:"abra o navegador"}}
    ]){const result=await runner.execute(action,dry);expect(result.value).toMatchObject({dryRun:true});}
    const notification=await runner.execute({id:"notify",type:"notification.show",config:{title:"Pronto",content:"Terminado"}},dry);
    expect(notification.value).toMatchObject({dryRun:true});expect(notification.value).not.toHaveProperty("notification");expect(execute).not.toHaveBeenCalled();
  });
});
