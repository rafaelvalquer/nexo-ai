import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import { z } from "zod";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AuditService } from "../../packages/core/src/audit/audit.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await fs.rm(dir,{recursive:true,force:true});});

describe("tool execution deadlines",()=>{
  it("aborts a hanging tool at its configured timeout and returns a handled failure",async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nexo-tool-timeout-"));dirs.push(dir);const db=new NexoDatabase(dir);await db.ready();let signal:AbortSignal|undefined;
    const registry=new ToolRegistry().register({name:"test_slow_read",description:"slow read",risk:"READ",permissions:[],timeoutMs:15,inputSchema:z.object({}),execute:async(_input,context)=>{signal=context?.signal;return new Promise<any>(()=>{});}});
    const audit=new AuditService(db),executor=new ActionExecutor(registry,new PermissionEngine(()=>({allowedRoots:[],autonomy:"balanced"} as any)),audit);const prepared=await executor.preflight("test_slow_read",{});if(!prepared.ok)throw new Error(prepared.message);
    const result=await executor.executePrepared(prepared.action);expect(result.status).toBe("FAILED");expect(result.error).toMatch(/15 ms/);expect(signal?.aborted).toBe(true);expect(audit.list()[0]).toMatchObject({action:"test_slow_read",status:"FAILED",details:{errorCode:"TimeoutError",durationMs:expect.any(Number)}});
  });
});
