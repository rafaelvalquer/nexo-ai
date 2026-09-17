import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConversationEntityLedger } from "../../packages/core/src/agent/context/conversation-entity-ledger.js";
import { EntityReferenceResolver } from "../../packages/core/src/agent/resolution/entity-reference-resolver.js";

let root:string;let db:NexoDatabase;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-page-reference-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

describe("current web page references",()=>{
  it("resolves ‘esta página’ to the most recently read public URL in the conversation",()=>{
    const ledger=new ConversationEntityLedger(db);ledger.record("chat-1",{toolCallId:"0",toolName:"web_search",ok:true,summary:"Pesquisa",trust:"UNTRUSTED_CONTENT",truncated:false,data:{results:[{url:"https://irrelevant.example/last-search-result",title:"Resultado"}]}});
    ledger.record("chat-1",{toolCallId:"1",toolName:"web_fetch",ok:true,summary:"Lido",trust:"UNTRUSTED_CONTENT",truncated:false,data:{url:"https://example.com/article",title:"Artigo"}});
    const resolver=new EntityReferenceResolver(ledger);
    expect(resolver.resolve("chat-1","Resuma esta página.")).toMatchObject({kind:"page",id:"https://example.com/article",label:"Artigo"});
    expect(resolver.resolve("chat-1","Resuma esta página.")).toMatchObject({kind:"page",id:"https://example.com/article"});
  });
});
