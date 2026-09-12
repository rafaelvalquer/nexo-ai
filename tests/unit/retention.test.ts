import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { RetentionService } from "../../packages/core/src/privacy/retention.js";

let root:string;let db:NexoDatabase;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-retention-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
describe("local retention",()=>{
  it("removes expired persisted data without deleting active tasks",()=>{
    const old="2000-01-01T00:00:00.000Z";
    db.run("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)",["m","c","user","old",old]);
    db.run("INSERT INTO tasks(id,type,status,input_json,created_at,finished_at) VALUES(?,?,?,?,?,?)",["finished","x","completed","{}",old,old]);
    db.run("INSERT INTO tasks(id,type,status,input_json,created_at) VALUES(?,?,?,?,?)",["active","x","running","{}",old]);
    const retention=new RetentionService(db,{purgeOlderThan:()=>0} as any);retention.purge(1);
    expect(db.get("SELECT * FROM messages WHERE id='m'")).toBeUndefined();expect(db.get("SELECT * FROM tasks WHERE id='finished'")).toBeUndefined();expect(db.get("SELECT * FROM tasks WHERE id='active'")).toBeTruthy();
  });
});
