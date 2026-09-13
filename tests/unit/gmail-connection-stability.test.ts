import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore,type OAuthHost } from "../../packages/core/src/connections/types.js";
import { EmailService } from "../../packages/core/src/email/service.js";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router.js";

let root:string;
let db:NexoDatabase;
let secrets:MemorySecretStore;
let originalFetch:typeof fetch;

beforeEach(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-gmail-stability-"));
  db=new NexoDatabase(root);await db.ready();
  secrets=new MemorySecretStore();
  originalFetch=globalThis.fetch;
});
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});});

function host():OAuthHost{return{
  openExternal:async()=>undefined,
  waitForLoopbackCallback:async({state})=>new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`),
  startLoopbackCallback:async({state})=>({redirectUri:"http://127.0.0.1:4567/oauth/callback",callback:Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))})
};}
function service(){return new ConnectionService(db,secrets,host(),()=>({googleClientId:"desktop-client.apps.googleusercontent.com",microsoftClientId:"",microsoftTenant:"common"}),()=>true);}
async function configuredService(){const value=service();await value.saveGoogleClientSecret("GOCSPX-test-secret");return value;}
function installSuccessfulOAuthMock(){
  globalThis.fetch=vi.fn(async(input:string|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.includes("oauth2.googleapis.com/token"))return new Response(JSON.stringify({access_token:"access-1",refresh_token:"refresh-1",expires_in:3600,scope:"openid email profile https://www.googleapis.com/auth/gmail.readonly"}),{status:200});
    if(url.includes("openidconnect.googleapis.com/v1/userinfo"))return new Response(JSON.stringify({sub:"google-user",email:"person@example.com",name:"Person"}),{status:200});
    if(url.includes("gmail.googleapis.com/gmail/v1/users/me/profile"))return new Response(JSON.stringify({emailAddress:"person@example.com",messagesTotal:40,threadsTotal:30}),{status:200});
    throw new Error(`Unexpected request ${url} ${String(init?.method??"GET")}`);
  }) as typeof fetch;
}

async function connectReadAccount(){installSuccessfulOAuthMock();const value=await configuredService();const account=await value.connect("google",["email.read"]);return{value,account};}

describe("persistent Gmail connection lifecycle",()=>{
  it("stores requested/granted scopes and restores the account without a new OAuth browser flow",async()=>{
    const{account}=await connectReadAccount();
    expect(account).toMatchObject({status:"connected",accountEmail:"person@example.com",capabilities:["email.read"],requestedCapabilities:["email.read"]});
    expect(account.grantedScopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    const row=db.get<any>("SELECT * FROM connections WHERE id=?",[account.id])!;
    expect(row.requested_capabilities_json).toContain("email.read");
    expect(row.granted_scopes_json).toContain("gmail.readonly");
    const restarted=service();
    await restarted.restoreConnections();
    expect(restarted.get(account.id)?.status).toBe("connected");
    expect(restarted.get(account.id)?.capabilities).toEqual(["email.read"]);
  });

  it("refreshes an expired access token on restart and preserves the existing refresh token",async()=>{
    const{account}=await connectReadAccount();
    const row=db.get<{token_secret_key:string}>("SELECT token_secret_key FROM connections WHERE id=?",[account.id])!;
    await secrets.set(row.token_secret_key,JSON.stringify({access_token:"expired",refresh_token:"refresh-stable",expires_at:"2000-01-01T00:00:00.000Z"}));
    globalThis.fetch=vi.fn(async(input:string|URL,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes("oauth2.googleapis.com/token")){
        const body=String(init?.body??"");
        expect(body).toContain("refresh_token=refresh-stable");
        expect(body).toContain("client_secret=GOCSPX-test-secret");
        return new Response(JSON.stringify({access_token:"fresh",expires_in:3600}),{status:200});
      }
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    const restarted=service();
    await restarted.restoreConnections();
    expect(restarted.get(account.id)).toMatchObject({status:"connected"});
    expect(restarted.get(account.id)?.lastRefreshAt).toBeTruthy();
    const stored=await secrets.get(row.token_secret_key);
    expect(stored).toContain("fresh");
    expect(stored).toContain("refresh-stable");
  });
});

describe("resilient Gmail requests",()=>{
  it("refreshes once after a Gmail 401 and retries the read operation",async()=>{
    const{value,account}=await connectReadAccount();
    let listAttempts=0,refreshes=0;
    globalThis.fetch=vi.fn(async(input:string|URL,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes("oauth2.googleapis.com/token")){refreshes++;return new Response(JSON.stringify({access_token:"fresh-access",expires_in:3600}),{status:200});}
      if(url.includes("/messages?")&&!url.includes("/messages/m1")){
        listAttempts++;
        if(listAttempts===1)return new Response(JSON.stringify({error:{message:"Invalid Credentials"}}),{status:401});
        return new Response(JSON.stringify({messages:[{id:"m1"}],resultSizeEstimate:1}),{status:200});
      }
      if(url.includes("/messages/m1?"))return new Response(JSON.stringify({id:"m1",threadId:"t1",internalDate:String(Date.now()),payload:{headers:[{name:"From",value:"sender@example.com"},{name:"To",value:"person@example.com"},{name:"Subject",value:"Teste"}]},snippet:"Olá",labelIds:["INBOX"]}),{status:200});
      throw new Error(`Unexpected request ${url} ${String(init?.method??"GET")}`);
    }) as typeof fetch;
    const email=new EmailService(value);
    await expect(email.latest(account.id)).resolves.toMatchObject({subject:"Teste"});
    expect(listAttempts).toBe(2);
    expect(refreshes).toBe(1);
  });

  it("returns real Gmail mailbox totals instead of the first page size",async()=>{
    const{value,account}=await connectReadAccount();
    globalThis.fetch=vi.fn(async(input:string|URL)=>{
      const url=String(input);
      if(url.endsWith("/profile"))return new Response(JSON.stringify({messagesTotal:1250,threadsTotal:800}),{status:200});
      if(url.endsWith("/labels/INBOX"))return new Response(JSON.stringify({messagesTotal:300,messagesUnread:12}),{status:200});
      if(url.endsWith("/labels/UNREAD"))return new Response(JSON.stringify({messagesTotal:27}),{status:200});
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    await expect(new EmailService(value).stats(account.id)).resolves.toEqual({totalMessages:1250,totalThreads:800,inboxMessages:300,unreadMessages:27});
  });

  it("keeps the account but marks reauthorization when Gmail reports insufficient scopes",async()=>{
    const{value,account}=await connectReadAccount();
    globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify({error:{message:"Request had insufficient authentication scopes.",errors:[{reason:"insufficientPermissions"}]}}),{status:403})) as typeof fetch;
    await expect(new EmailService(value).latest(account.id)).rejects.toThrow(/não concedeu a permissão/i);
    expect(value.get(account.id)?.status).toBe("reauthorization-required");
  });
});

describe("deterministic email intents",()=>{
  it("routes last-email and mailbox-count questions without the LLM",()=>{
    const router=new FastIntentRouter();
    expect(router.route("qual o ultimo e-mail recebido?")).toMatchObject({tool:"email_latest"});
    expect(router.route("quantos e-mails eu tenho?")).toMatchObject({tool:"email_stats"});
    expect(router.route("quantos emails não lidos eu tenho?")).toMatchObject({tool:"email_stats"});
  });
});
