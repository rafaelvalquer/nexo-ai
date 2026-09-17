import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AutomationEngine } from "../../packages/core/src/automation/engine.js";
import { MacroEngine } from "../../packages/core/src/macros/macro-engine.js";
import { macroTools } from "../../packages/core/src/tools/macros/index.js";

let root:string;let db:NexoDatabase;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-macro-chat-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

describe("macro chat confirmation flow",()=>{
  it("asks for details, keeps the generated draft pending, and saves only after confirmation",async()=>{
    const legacy=new AutomationEngine(db,async()=>undefined),engine=new MacroEngine(legacy),draft=async(description:string,name?:string)=>({name:name??"Rotina",description,actions:[{id:"open",type:"system.open_application",config:{application:"chrome"}}]}),tools=macroTools(engine,db,draft);
    const create=tools.find(tool=>tool.name==="macro_create_draft")!,confirm=tools.find(tool=>tool.name==="macro_confirm_draft")!;
    const prompt=await create.execute({name:"Início"},{conversationId:"chat-a"});expect(prompt.summary).toContain("O que a macro");
    const draftResult=await create.execute({description:"Abrir Chrome ao começar"},{conversationId:"chat-a"});
    expect(draftResult.summary).toContain("confirmo a criação");expect(engine.list()).toHaveLength(0);
    await expect(confirm.execute({confirm:true},{conversationId:"chat-b"})).rejects.toThrow(/Não há rascunho/);
    const saved=await confirm.execute({confirm:true},{conversationId:"chat-a"});
    expect(saved.summary).toContain("pronta para execução manual");expect(engine.list()).toMatchObject([{name:"Início",enabled:true,trigger:{type:"manual"}}]);
    await expect(confirm.execute({confirm:true},{conversationId:"chat-a"})).rejects.toThrow(/Não há rascunho/);
    engine.stop();
  });
});
