import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { NexoCore } from "../../packages/core/src/index.js";

const roots:string[]=[];
const cores:NexoCore[]=[];
afterEach(async()=>{for(const core of cores.splice(0))await core.shutdown();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});

async function coreWithSettings(overrides:Record<string,unknown>){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-optional-modules-"));roots.push(root);
  const seed=new NexoDatabase(root);await seed.ready();seed.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)",[JSON.stringify({settingsSchemaVersion:3,...overrides})]);
  const core=new NexoCore({dataDir:root});cores.push(core);await core.ready();return core;
}

describe("NexoCore optional modules",()=>{
  it("keeps optional connections out of the default first-start Core",async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-default-modules-"));roots.push(root);
    const core=new NexoCore({dataDir:root});cores.push(core);await core.ready();
    expect(core.getSettings().connectionsEnabled).toBe(false);
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"connections",status:"disabled"},{id:"documents",status:"disabled"},{id:"rag",status:"disabled"}
    ]));
    expect(core.tools.list().some(tool=>tool.name.startsWith("email_")||tool.name.startsWith("calendar_")||tool.name.startsWith("document_"))).toBe(false);
  });

  it("starts the basic Core without instantiating disabled connections, documents, or RAG",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:false,semanticSearchEnabled:false});
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"connections",status:"disabled"},{id:"documents",status:"disabled"},{id:"rag",status:"disabled"}
    ]));
    expect(core.tools.list().some(tool=>tool.name.startsWith("email_")||tool.name.startsWith("calendar_")||tool.name.startsWith("document_"))).toBe(false);
    expect(core.tools.list().some(tool=>tool.name==="web_search"||tool.name==="find_file")).toBe(true);
  });

  it("loads Documents and RAG independently by capability",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:true,semanticSearchEnabled:true});
    expect(core.moduleSnapshot().find(module=>module.id==="documents")?.status).toBe("disabled");
    await core.ensureDocuments();
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"documents",status:"ready"},{id:"rag",status:"disabled"}
    ]));
    expect(core.tools.list().some(tool=>tool.name==="document_get")).toBe(true);
    await core.ensureRag();
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"documents",status:"ready"},{id:"rag",status:"ready"}
    ]));
  });

  it("loads Documents without RAG when semantic search is disabled",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:true,semanticSearchEnabled:false});
    await core.ensureDocuments();
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"documents",status:"ready"},{id:"rag",status:"disabled"}
    ]));
  });

  it("rejects document attachments clearly when Documents is disabled without affecting filesystem",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:false,semanticSearchEnabled:false});
    const conversation=await core.createConversation("Documents disabled");
    await expect(core.startChatTask(conversation.id,"resuma este documento",["fake-document-id"])).rejects.toThrow("módulo de documentos está desativado");
    expect(core.tools.list().some(tool=>tool.name==="find_file"||tool.name==="list_files")).toBe(true);
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([{id:"documents",status:"disabled"},{id:"rag",status:"disabled"}]));
  });

  it("does not construct Connections while disabled and attaches its tools on demand",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:false,semanticSearchEnabled:false});
    await expect(core.ensureConnections()).rejects.toThrow("desativado");
    expect(core.moduleSnapshot().find(module=>module.id==="connections")?.status).toBe("disabled");
    core.updateSettings({connectionsEnabled:true});
    const connections=await core.ensureConnections();
    expect(connections).toBeDefined();
    expect(core.moduleSnapshot().find(module=>module.id==="connections")?.status).toBe("ready");
    expect(core.tools.list().some(tool=>tool.name.startsWith("email_")||tool.name.startsWith("calendar_"))).toBe(true);
  });

  it("unregisters optional tools and stops dependent RAG when Documents are disabled",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:true,semanticSearchEnabled:true});
    await core.ensureRag();
    expect(core.tools.list().some(tool=>tool.name==="document_get")).toBe(true);
    expect(core.moduleSnapshot().find(module=>module.id==="rag")?.status).toBe("ready");
    await core.modules.disable("documents");
    expect(core.moduleSnapshot()).toEqual(expect.arrayContaining([
      {id:"documents",status:"disabled"},{id:"rag",status:"disabled"}
    ]));
    expect(core.tools.list().some(tool=>tool.name.startsWith("document_"))).toBe(false);
  });

  it("keeps Browser Agent tools out until enabled and unregisters them when disabled",async()=>{
    const core=await coreWithSettings({connectionsEnabled:false,documentsEnabled:false,semanticSearchEnabled:false,browserAutomationEnabled:false});
    const service={shutdown:async()=>{}} as any;
    await core.registerBrowserAgentModule(service);
    expect(core.moduleSnapshot().find(module=>module.id==="browser")?.status).toBe("disabled");
    expect(core.tools.list().some(tool=>tool.name==="browser_agent_run")).toBe(false);
    core.updateSettings({browserAutomationEnabled:true});
    await core.modules.enable("browser");
    expect(core.tools.list().some(tool=>tool.name==="browser_agent_run")).toBe(true);
    await core.modules.disable("browser");
    expect(core.tools.list().some(tool=>tool.name==="browser_agent_run")).toBe(false);
  });
});
