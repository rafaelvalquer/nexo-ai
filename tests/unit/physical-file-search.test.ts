import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysicalFileSearch } from "../../packages/core/src/filesystem/physical-file-search.js";
import { WorkspaceFileRepository } from "../../packages/core/src/filesystem/workspace-file-repository.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";

const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function temp(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nexo-file-search-"));roots.push(dir);return dir;}

describe("PhysicalFileSearch",()=>{
  it("searches arbitrary authorized roots, reports metadata and skips symlinks",async()=>{const root=await temp(),project=path.join(root,"Projetos");await fs.mkdir(project);await fs.writeFile(path.join(project,"Caderno_de_Testes_Nexo_AI.txt"),"ok");const result=await new PhysicalFileSearch().find({roots:[root],query:"Caderno_de_Testes_Nexo_AI.txt"});expect(result.matches).toHaveLength(1);expect(result.matches[0]).toMatchObject({root,name:"Caderno_de_Testes_Nexo_AI.txt",size:2});});
  it("never returns a match rejected by current path policy",async()=>{const root=await temp();await fs.writeFile(path.join(root,"secret.txt"),"x");const result=await new PhysicalFileSearch().find({roots:[root],query:"secret.txt"},undefined,()=>{throw new Error("PATH_DENIED");});expect(result.matches).toEqual([]);});
  it("observes abort signals and enforces maxEntries",async()=>{const root=await temp();await Promise.all(Array.from({length:100},(_,i)=>fs.writeFile(path.join(root,`${i}.txt`),"x")));const bounded=await new PhysicalFileSearch().find({roots:[root],query:"missing.txt",maxEntries:7});expect(bounded.scannedEntries).toBe(7);expect(bounded.truncated).toBe(true);const controller=new AbortController();controller.abort();await expect(new PhysicalFileSearch().find({roots:[root],query:"missing.txt"},controller.signal)).rejects.toMatchObject({name:"AbortError"});});
  it("stores and finds workspace metadata by exact normalized name",async()=>{const dir=await temp(),db=new NexoDatabase(dir);await db.ready();const repository=new WorkspaceFileRepository(db);repository.upsert({id:"a",root:dir,path:path.join(dir,"Teste.xlsx"),parentPath:dir,name:"Teste.xlsx",nameNormalized:"teste.xlsx",extension:".xlsx",size:4,modifiedAt:new Date().toISOString(),indexedAt:new Date().toISOString()});expect(repository.findExact("TESTE.XLSX",[dir])).toHaveLength(1);expect(repository.findExact("Teste.xlsx",[path.dirname(dir)] )).toEqual([]);});
  it("runs find_file through ActionExecutor using current authorized roots only",async()=>{const allowed=await temp(),outside=await temp();await fs.writeFile(path.join(allowed,"Caderno_de_Testes_Nexo_AI.txt"),"safe");await fs.writeFile(path.join(outside,"Caderno_de_Testes_Nexo_AI.txt"),"secret");const settings:any={allowedRoots:[allowed],autonomy:"balanced",fileWritesEnabled:true,browserAutomationEnabled:true,connectionsEnabled:true,allowedDomains:[]};const permissions=new PermissionEngine(()=>settings),registry=new ToolRegistry({filesystemRoots:()=>permissions.allowedRoots(),permissions});const executor=new ActionExecutor(registry,permissions,{record(){} } as any);const prepared=await executor.preflight("find_file",{fileName:"Caderno_de_Testes_Nexo_AI.txt"},{userRequest:"Procure arquivo Caderno_de_Testes_Nexo_AI.txt"});expect(prepared.ok).toBe(true);if(!prepared.ok)return;const result=await executor.executePrepared(prepared.action);expect(result.status).toBe("SUCCEEDED");expect((result.result?.data as any).matches.map((m:any)=>m.path)).toEqual([path.join(allowed,"Caderno_de_Testes_Nexo_AI.txt")]);});
});
