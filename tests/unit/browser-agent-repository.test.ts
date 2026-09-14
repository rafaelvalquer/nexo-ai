import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { BrowserRunRepository } from "../../packages/core/src/browser-agent/repository";

let root:string,db:NexoDatabase,repo:BrowserRunRepository;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-browser-repo-"));db=new NexoDatabase(root);await db.ready();repo=new BrowserRunRepository(db);});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

describe("BrowserRunRepository",()=>{
  it("persists run metadata but has no frame/blob event columns",()=>{
    const columns=db.all<{name:string}>("PRAGMA table_info(browser_run_events)").map(row=>row.name);
    expect(columns).not.toContain("frame");expect(columns).not.toContain("bytes");expect(columns).not.toContain("image");
  });
  it("marks interrupted active runs failed on recovery",()=>{
    repo.create({id:"r",taskId:"t",conversationId:"c",request:"x",status:"running",mode:"research",allowedDomains:["*.example.com"],stepCount:0,startedAt:new Date().toISOString()});
    repo.recoverInterrupted();
    expect(repo.get("r")?.status).toBe("failed");
  });
  it("stores the explicit personal-profile opt-in",()=>{expect(repo.personalProfileEnabled()).toBe(false);repo.setPersonalProfileEnabled(true);expect(repo.personalProfileEnabled()).toBe(true);});
});
