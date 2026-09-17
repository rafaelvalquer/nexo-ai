import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { LocalMetricsService } from "../../packages/core/src/observability/metrics.js";
import { BackgroundTaskService } from "../../packages/core/src/tasks/background.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
import { NexoCore } from "../../packages/core/src/index.js";

let root:string, db:NexoDatabase, metrics:LocalMetricsService;
const logger={warn:vi.fn()};
beforeEach(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-metrics-")); db=new NexoDatabase(root); await db.ready();
  metrics=new LocalMetricsService(db,logger); logger.warn.mockClear();
  vi.useFakeTimers();
});
afterEach(()=>{vi.restoreAllMocks();metrics.close();vi.useRealTimers();fs.rmSync(root,{recursive:true,force:true});});
const rows=()=>db.all<{id:string;value:number;created_at:string;tags_json:string}>("SELECT * FROM local_metrics");

describe("buffered local metrics",()=>{
  it("buffers 1000 events and exports once after five seconds without extending the deadline",()=>{
    const exports=vi.spyOn((db as any).db,"export"), start=new Date().toISOString();
    for(let i=0;i<1000;i++)metrics.record("tokens",1,{kind:"token"});
    expect(exports).not.toHaveBeenCalled();expect(rows()).toHaveLength(0);
    expect(metrics.snapshot()).toMatchObject([{metric:"tokens",count:1000,average:1,latest:start}]);
    vi.advanceTimersByTime(4999); metrics.record("duration",30);
    expect(exports).not.toHaveBeenCalled();vi.advanceTimersByTime(1);
    expect(exports).toHaveBeenCalledTimes(1);expect(rows()).toHaveLength(1001);
    expect(rows()[0]).toMatchObject({created_at:start,tags_json:'{"kind":"token"}'});
    vi.advanceTimersByTime(10000);expect(exports).toHaveBeenCalledTimes(1);
  });
  it("combines persisted and pending samples and reads latest without writing",()=>{
    metrics.record("duration",10);metrics.flush();vi.advanceTimersByTime(10);metrics.record("duration",30);
    const exports=vi.spyOn((db as any).db,"export");
    expect(metrics.latest("duration")).toBe(new Date().toISOString());
    expect(metrics.latest("missing")).toBeUndefined();
    expect(metrics.snapshot()).toMatchObject([{count:2,average:20}]);expect(exports).not.toHaveBeenCalled();
  });
  it("retains a rolled-back batch and retries it",()=>{
    metrics.record("duration",10);
    vi.spyOn(db,"run").mockImplementationOnce(()=>{throw new Error("insert failed");});
    expect(metrics.flush()).toBe(false);expect(rows()).toHaveLength(0);
    expect(metrics.snapshot()[0].count).toBe(1);vi.advanceTimersByTime(5000);
    expect(rows()).toHaveLength(1);expect(logger.warn).toHaveBeenCalledTimes(1);
  });
  it("recovers a failed export after COMMIT without corrupting depth or duplicating samples",async()=>{
    metrics.record("duration",10);
    vi.spyOn(db as any,"persist").mockImplementationOnce(()=>{throw new Error("disk full");});
    expect(metrics.flush()).toBe(false);expect(rows()).toHaveLength(1);
    metrics.record("duration",30);expect(metrics.snapshot()).toMatchObject([{count:2,average:20}]);
    vi.advanceTimersByTime(5000);expect(rows()).toHaveLength(2);
    db.run("INSERT INTO settings VALUES('after-failure','ok')");
    const reopened=new NexoDatabase(root);await reopened.ready();
    expect(reopened.get("SELECT value FROM settings WHERE key='after-failure'")).toEqual({value:"ok"});
    expect(reopened.all("SELECT * FROM local_metrics")).toHaveLength(2);
  });
  it("flushes a full buffer outside record and bounds repeated failure memory",()=>{
    const exports=vi.spyOn((db as any).db,"export");
    for(let i=0;i<10000;i++)metrics.record("sample",i);
    expect(exports).not.toHaveBeenCalled();vi.advanceTimersByTime(0);
    expect(exports).toHaveBeenCalledTimes(1);expect(rows()).toHaveLength(10000);
    vi.spyOn(db,"transaction").mockImplementation(()=>{throw new Error("offline");});
    for(let i=0;i<10000;i++)metrics.record("failed",i);
    vi.advanceTimersByTime(0);
    for(let i=10000;i<10010;i++)metrics.record("failed",i);
    expect(metrics.snapshot().find(row=>row.metric==="failed")).toMatchObject({count:10000,average:5009.5});
    expect(logger.warn.mock.calls.filter(([message])=>message.includes("descartadas"))).toHaveLength(1);
  });
  it("closes once, cancels timers and preserves immediate approval writes",async()=>{
    metrics.record("queued",1);
    const approvals=new ApprovalService(db,metrics);
    const approval=approvals.create("test",{},"WRITE","test");
    const reopened=new NexoDatabase(root);await reopened.ready();
    expect(reopened.get("SELECT id FROM approvals WHERE id=?",[approval.id])).toBeTruthy();
    expect(reopened.all("SELECT * FROM local_metrics")).toHaveLength(0);
    const exports=vi.spyOn((db as any).db,"export");metrics.close();metrics.close();metrics.record("ignored",1);
    vi.advanceTimersByTime(10000);expect(exports).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it("flushes metrics through the Core backup entry point",async()=>{
    metrics.record("backup",1);
    const backup=NexoCore.prototype.backup.call({metrics,db} as NexoCore);
    const backupRoot=path.join(root,"restore");fs.mkdirSync(backupRoot);fs.copyFileSync(backup,path.join(backupRoot,"nexo.db"));
    const reopened=new NexoDatabase(backupRoot);await reopened.ready();expect(reopened.all("SELECT * FROM local_metrics")).toHaveLength(1);
  });
  it("keeps streaming event telemetry buffered while operational progress persists",()=>{
    const tasks=new BackgroundTaskService(db);tasks.subscribe(event=>metrics.record("assistant.ipc_events",1,{kind:event.kind}));
    const task=tasks.create("assistant-chat",{});tasks.markRunning(task.id);
    const exports=vi.spyOn((db as any).db,"export");
    for(let i=0;i<1000;i++)tasks.appendProgress(task.id,"x");
    expect(exports).not.toHaveBeenCalled();vi.advanceTimersByTime(350);
    expect(exports).toHaveBeenCalledTimes(1);expect(rows()).toHaveLength(0);
    vi.advanceTimersByTime(4650);expect(exports).toHaveBeenCalledTimes(2);
    expect(db.get<{count:number}>("SELECT COUNT(*) count FROM local_metrics WHERE tags_json=?",['{"kind":"token"}'])?.count).toBe(1000);
    tasks.complete(task.id,{});
  });
});

it("Core shutdown flushes the shared metrics service and does not leave a retry timer",()=>{
  metrics.record("shutdown",1);
  const core={metrics,automation:{stop:vi.fn()},browserSessions:{closeAll:vi.fn(async()=>{})},logger:{info:vi.fn()}};
  NexoCore.prototype.shutdown.call(core as any);
  expect(rows()).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
  NexoCore.prototype.shutdown.call(core as any);expect(rows()).toHaveLength(1);
});
