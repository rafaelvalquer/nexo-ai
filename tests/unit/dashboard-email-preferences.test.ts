import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { NexoCore } from "../../packages/core/src/index.js";
import { EmailService } from "../../packages/core/src/email/service.js";
import { seedConnectedAccount } from "../helpers/connection-fixture.js";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("Dashboard email preferences", () => {
  it("propaga primary + updates até as queries reais do Gmail", async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-dashboard-email-pref-"));
    tempDirs.push(dir);
    const db=new NexoDatabase(dir);
    await db.ready();
    seedConnectedAccount({db,id:"acc-google-dashboard",provider:"google",capabilities:["email.read"]});

    const core=new NexoCore({dataDir:dir});
    await core.ready();
    core.updateSettings({connectionsEnabled:true});
    await core.ensureConnections();
    (core as any).connections.accessToken=async()=>"fixture-token";

    const queries:string[]=[];
    globalThis.fetch=vi.fn(async(input:RequestInfo|URL)=>{
      const parsed=new URL(String(input));
      if(parsed.pathname.endsWith("/profile"))return Response.json({messagesTotal:10,threadsTotal:8});
      if(parsed.pathname.endsWith("/messages")){
        const query=parsed.searchParams.get("q")??"";
        queries.push(query);
        return Response.json({messages:[],resultSizeEstimate:query.includes("is:unread")?2:5});
      }
      throw new Error(`Unexpected request ${parsed.toString()}`);
    }) as typeof fetch;

    await core.saveEmailSearchPreferences("acc-google-dashboard",["primary","updates"]);
    queries.length=0;
    await core.dashboardRefresh("email");

    expect(queries).toContain("in:inbox {category:primary category:updates}");
    expect(queries).toContain("in:inbox is:unread {category:primary category:updates}");
  });

  it("mantém Microsoft inbox sem transformar a preferência em filtro de categoria", async () => {
    const requests:string[]=[];
    const service=new EmailService({
      get:()=>({id:"acc-ms",provider:"microsoft"}),
      accessToken:async()=>"fixture-token"
    } as any);
    service.setPreferenceResolver({resolveCategories:()=>["inbox"]});

    globalThis.fetch=vi.fn(async(input:RequestInfo|URL)=>{
      requests.push(String(input));
      return Response.json({value:[]});
    }) as typeof fetch;

    await service.search({connectionId:"acc-ms",maxResults:5});
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).pathname).toBe("/v1.0/me/mailFolders/inbox/messages");
    expect(requests[0]).not.toContain("primary");
  });
});
