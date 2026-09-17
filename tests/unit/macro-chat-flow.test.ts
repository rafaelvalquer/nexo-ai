import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AutomationEngine } from "../../packages/core/src/automation/engine.js";
import { macroTools } from "../../packages/core/src/tools/macros/index.js";

let root:string;let db:NexoDatabase;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-macro-chat-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

describe("macro chat confirmation flow",()=>{
  it("keeps a natural draft pending until the user confirms, then saves it paused",async()=>{
    const engine=new AutomationEngine(db,async()=>undefined),tools=macroTools(engine,db,async(description,name)=>({name:name??"Rotina",description,actions:[{id:"open",type:"system.open_application",config:{application:"chrome"}}]}));
    const create=tools.find(tool=>tool.name==="macro_create_draft")!,confirm=tools.find(tool=>tool.name==="macro_confirm_draft")!;
    const draft=await create.execute({name:"Início",description:"Abrir Chrome ao começar"},{conversationId:"chat-a"});
    expect(draft.summary).toContain("Para salvar pausada");expect(engine.list()).toHaveLength(0);
    await expect(confirm.execute({confirm:true},{conversationId:"chat-b"})).rejects.toThrow(/Não há rascunho/);
    const saved=await confirm.execute({confirm:true},{conversationId:"chat-a"});
    expect(saved.summary).toContain("salva pausada");expect(engine.list()).toMatchObject([{name:"Início",enabled:false}]);
    await expect(confirm.execute({confirm:true},{conversationId:"chat-a"})).rejects.toThrow(/Não há rascunho/);
    engine.stop();
  });
});
