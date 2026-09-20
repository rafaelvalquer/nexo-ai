import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { NexoCore } from "../../packages/core/src/index.js";
import { EmailService } from "../../packages/core/src/email/service.js";
import { seedConnectedAccount } from "../helpers/connection-fixture.js";

const tempDirs:string[]=[];
const cores:NexoCore[]=[];
const originalFetch=globalThis.fetch;
afterEach(async()=>{await Promise.all(cores.splice(0).map(core=>core.shutdown()));globalThis.fetch=originalFetch;vi.restoreAllMocks();tempDirs.splice(0).forEach(dir=>fs.rmSync(dir,{recursive:true,force:true}));});

describe("Dashboard email trash",()=>{
  it("routes dashboardEmailTrash through email_trash in AgentEngine",async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-dashboard-trash-"));tempDirs.push(dir);
    const db=new NexoDatabase(dir);await db.ready();
    seedConnectedAccount({db,id:"acc-trash",provider:"google",capabilities:["email.read","email.modify"]});
    const core=new NexoCore({dataDir:dir});cores.push(core);await core.ready();core.updateSettings({connectionsEnabled:true});await core.ensureConnections();
    const runPlan=vi.fn(async()=>({approvalId:"approval-trash"}));
    (core as any).agent.runPlan=runPlan;

    await expect(core.dashboardEmailTrash({connectionId:"acc-trash",messageId:"message-1"})).resolves.toMatchObject({approvalId:"approval-trash"});
    expect(runPlan).toHaveBeenCalledWith("Mover e-mail para a lixeira pelo Dashboard",[{tool:"email_trash",input:{connectionId:"acc-trash",messageId:"message-1"}}]);
  });

  it("uses Gmail trash endpoint",async()=>{
    const requests:Request[]=[];
    globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push(new Request(input,init));return new Response(null,{status:204});}) as typeof fetch;
    const service=new EmailService({get:()=>({id:"g1",provider:"google"}),accessToken:async()=>"token"} as any);
    await service.modify("g1","mail-1","trash");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/gmail/v1/users/me/messages/mail-1/trash");
    expect(requests[0].method).toBe("POST");
  });

  it("moves Microsoft messages to deleteditems",async()=>{
    const calls:Array<{url:string;method:string;body:string}>= [];
    globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(input),method:init?.method??"GET",body:String(init?.body??"")});return Response.json({id:"mail-2"});}) as typeof fetch;
    const service=new EmailService({get:()=>({id:"m1",provider:"microsoft"}),accessToken:async()=>"token"} as any);
    await service.modify("m1","mail-2","trash");
    expect(calls[0].url).toContain("/me/messages/mail-2/move");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body)).toEqual({destinationId:"deleteditems"});
  });
});
