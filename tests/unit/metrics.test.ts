import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { LocalMetricsService } from "../../packages/core/src/observability/metrics.js";

let root:string; let db:NexoDatabase;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-metrics-"));db=new NexoDatabase(root);await db.ready();});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
describe("local metrics",()=>{
  it("applies the current durable-runtime and metrics migrations",()=>{
    const tables=db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name);
    expect(tables).toEqual(expect.arrayContaining(["agent_runs","agent_steps","agent_checkpoints","local_metrics"]));
  });
  it("aggregates operational values without persisting payload content",()=>{
    const metrics=new LocalMetricsService(db);metrics.record("tool.duration_ms",10,{tool:"email_search",ok:true});metrics.record("tool.duration_ms",30,{tool:"email_search",ok:true});
    expect(metrics.snapshot()).toMatchObject([{metric:"tool.duration_ms",count:2,average:20}]);
    expect(db.get<{tags_json:string}>("SELECT tags_json FROM local_metrics LIMIT 1")?.tags_json).not.toContain("conteúdo");
  });
});
