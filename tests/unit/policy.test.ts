import { describe,it,expect } from "vitest";
import path from "node:path";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";

describe("PermissionEngine",()=>{
  it("permite apenas subcaminhos autorizados",()=>{const root=path.resolve("/tmp/nexo-safe");const p=new PermissionEngine(()=>({model:"x",ollamaUrl:"http://localhost",autonomy:"balanced",allowedRoots:[root],privateMode:false,runInBackground:true}));expect(p.isPathAllowed(path.join(root,"a.txt"))).toBe(true);expect(p.isPathAllowed(path.resolve("/tmp/other/a.txt"))).toBe(false);});
  it("balanced não pede aprovação para SAFE_WRITE",()=>{const p=new PermissionEngine(()=>({model:"x",ollamaUrl:"http://localhost",autonomy:"balanced",allowedRoots:[],privateMode:false,runInBackground:true}));expect(p.requiresApproval("SAFE_WRITE")).toBe(false);expect(p.requiresApproval("CRITICAL")).toBe(true);});
});
