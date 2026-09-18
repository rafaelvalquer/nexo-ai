import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime.js";
import { ClarificationRepository } from "../../packages/core/src/agent/clarification/repository.js";
import { ClarificationService } from "../../packages/core/src/agent/clarification/service.js";
import { ClarificationResolver } from "../../packages/core/src/agent/clarification/resolver.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { CommandService } from "../../packages/core/src/application/command-service.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";

const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await fs.rm(dir,{recursive:true,force:true});});

describe("persistent file-match clarification",()=>{
  it("keeps the requested analysis and file options across runtime restart and resolves Downloads",async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nexo-file-match-db-"));dirs.push(dir);
    const downloads=path.join(dir,"Downloads");await fs.mkdir(downloads);
    const permissions=new PermissionEngine(()=>({allowedRoots:[downloads]} as any));
    const previous={updatedAt:new Date().toISOString(),lastDomain:"filesystem" as const,lastTool:"find_file",files:[{name:"teste.txt",path:path.join(downloads,"teste.txt"),root:downloads},{name:"teste.pdf",path:path.join(downloads,"teste.pdf"),root:downloads}]};
    const route=new CommandService(new ToolRegistry(),()=>permissions.allowedRoots()).route("analise esse arquivo",previous);
    expect(route.type).toBe("clarification");if(route.type!=="clarification")return;
    const db=new NexoDatabase(dir);await db.ready();
    const service=new ClarificationService(new ClarificationRepository(new AgentRuntime(db)),new ClarificationResolver(permissions));
    const pending=service.create("conversation-file-match","analise esse arquivo",route.intent);
    expect(service.block(pending).questions[0]).toMatchObject({field:"fileMatch",type:"single_choice",options:[{label:"Downloads / teste.txt"},{label:"Downloads / teste.pdf"}]});

    const restarted=new ClarificationService(new ClarificationRepository(new AgentRuntime(db)),new ClarificationResolver(permissions));
    expect(restarted.pending("conversation-file-match")?.partialEntities.files).toHaveLength(2);
    const answer=restarted.tryResolveText("conversation-file-match","o segundo");
    expect(answer.kind).toBe("resolved");
    if(answer.kind==="resolved")expect(answer.value.intent).toMatchObject({status:"ready",operation:"analyze_file",entities:{path:path.join(downloads,"teste.pdf")}});
  });
});
