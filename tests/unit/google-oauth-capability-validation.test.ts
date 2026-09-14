import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore,type OAuthHost } from "../../packages/core/src/connections/types.js";

let root:string;let db:NexoDatabase;let secrets:MemorySecretStore;let oldFetch:typeof fetch;
const CLIENT_ID="desktop-client.apps.googleusercontent.com";
const GMAIL_READ="https://www.googleapis.com/auth/gmail.readonly";
const CALENDAR_READ="https://www.googleapis.com/auth/calendar.readonly";
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-google-capability-"));db=new NexoDatabase(root);await db.ready();secrets=new MemorySecretStore();oldFetch=globalThis.fetch;});
afterEach(()=>{globalThis.fetch=oldFetch;vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});});

function host():OAuthHost{return{openExternal:async()=>undefined,waitForLoopbackCallback:async({state})=>new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`),startLoopbackCallback:async({state})=>({redirectUri:"http://127.0.0.1:4567/oauth/callback",callback:Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))})};}
async function service(logs:unknown[]=[]){const value=new ConnectionService(db,secrets,host(),()=>({googleClientId:CLIENT_ID,microsoftClientId:"",microsoftTenant:"common"}),()=>true,undefined,diagnostic=>logs.push(diagnostic));await value.saveGoogleClientSecret("GOCSPX-secret-value");return value;}
function token(scope?:string){return{access_token:"access-secret-value",refresh_token:"refresh-secret-value",expires_in:3600,...(scope?{scope}:{})};}
function oauthMock(options:{scope?:string;tokenInfoScope?:string;gmail?:Response;calendar?:Response}){
  globalThis.fetch=vi.fn(async(input:string|URL)=>{const url=String(input);
    if(url.includes("oauth2.googleapis.com/token")&&!url.includes("tokeninfo"))return new Response(JSON.stringify(token(options.scope)),{status:200});
    if(url.includes("oauth2.googleapis.com/tokeninfo"))return new Response(JSON.stringify({issued_to:CLIENT_ID,scope:options.tokenInfoScope??options.scope??`openid email profile ${GMAIL_READ}`,email:"person@example.com",expires_in:3600}),{status:200});
    if(url.includes("openidconnect.googleapis.com/v1/userinfo"))return new Response(JSON.stringify({sub:"user",email:"person@example.com",name:"Person"}),{status:200});
    if(url.includes("gmail.googleapis.com"))return options.gmail??new Response(JSON.stringify({emailAddress:"person@example.com"}),{status:200});
    if(url.includes("calendar/v3"))return options.calendar??new Response(JSON.stringify({items:[]}),{status:200});
    throw new Error(`Unexpected ${url}`);
  }) as typeof fetch;
}

describe("Google OAuth capability validation",()=>{
  it("uses the Gmail probe when the token response omits scope",async()=>{
    oauthMock({tokenInfoScope:`openid email profile ${GMAIL_READ}`});const value=await service();const account=await value.connect("google",["email.read"]);
    expect(account.capabilities).toEqual(["email.read"]);expect(account.grantedScopes).toEqual([]);expect(account.scopeSource).toBe("unknown");
  });

  it("does not persist a connection or token when Gmail validation fails",async()=>{
    oauthMock({scope:"openid email profile",tokenInfoScope:"openid email profile",gmail:new Response(JSON.stringify({error:{message:"Request had insufficient authentication scopes.",errors:[{reason:"insufficientPermissions"}]}}),{status:403})});const value=await service();
    await expect(value.connect("google",["email.read"])).rejects.toThrow(/Nenhuma capability foi ativada/);
    expect(db.all("SELECT * FROM connections")).toHaveLength(0);expect(secrets.values.size).toBe(0);
  });

  it("explains a disabled Gmail API without persisting authorization",async()=>{
    oauthMock({scope:GMAIL_READ,gmail:new Response(JSON.stringify({error:{message:"Google Gmail API has not been used in project.",errors:[{reason:"accessNotConfigured"}]}}),{status:403})});const value=await service();
    await expect(value.connect("google",["email.read"])).rejects.toThrow(/API está desabilitada|projeto diferente/i);
  });

  it("keeps only Gmail active when Calendar validation fails and writes no secrets to diagnostics",async()=>{
    const logs:unknown[]=[];oauthMock({tokenInfoScope:`openid email profile ${GMAIL_READ} ${CALENDAR_READ}`,calendar:new Response(JSON.stringify({error:{message:"Request had insufficient authentication scopes.",errors:[{reason:"insufficientPermissions"}]}}),{status:403})});const value=await service(logs);
    const account=await value.connect("google",["email.read","calendar.read"]);
    expect(account.status).toBe("degraded");expect(account.capabilities).toEqual(["email.read"]);expect(account.requestedCapabilities).toEqual(["email.read","calendar.read"]);
    const serialized=JSON.stringify(logs);expect(serialized).not.toContain("access-secret-value");expect(serialized).not.toContain("refresh-secret-value");expect(serialized).not.toContain("GOCSPX-secret-value");
  });

  it("keeps Calendar active when Gmail validation fails",async()=>{
    oauthMock({tokenInfoScope:`openid email profile ${GMAIL_READ} ${CALENDAR_READ}`,gmail:new Response(JSON.stringify({error:{message:"Insufficient Permission",errors:[{reason:"insufficientPermissions"}]}}),{status:403})});const value=await service();
    const account=await value.connect("google",["email.read","calendar.read"]);
    expect(account.status).toBe("degraded");expect(account.capabilities).toEqual(["calendar.read"]);expect(account.grantedScopes).toEqual(expect.arrayContaining([GMAIL_READ,CALENDAR_READ]));
  });

  it("records and revalidates scopes returned during token refresh",async()=>{
    oauthMock({scope:`openid email profile ${GMAIL_READ}`});const value=await service();const account=await value.connect("google",["email.read"]);
    const row=db.get<{token_secret_key:string}>("SELECT token_secret_key FROM connections WHERE id=?",[account.id])!;
    await secrets.set(row.token_secret_key,JSON.stringify({access_token:"expired",refresh_token:"refresh-secret-value",expires_at:"2000-01-01T00:00:00.000Z"}));
    globalThis.fetch=vi.fn(async(input:string|URL)=>{const url=String(input);
      if(url.includes("oauth2.googleapis.com/token")&&!url.includes("tokeninfo"))return new Response(JSON.stringify({access_token:"fresh-access",expires_in:3600,scope:`openid email profile ${GMAIL_READ}`}),{status:200});
      if(url.includes("oauth2.googleapis.com/tokeninfo"))return new Response(JSON.stringify({issued_to:CLIENT_ID,scope:`openid email profile ${GMAIL_READ}`}),{status:200});
      if(url.includes("gmail.googleapis.com"))return new Response(JSON.stringify({emailAddress:"person@example.com"}),{status:200});
      throw new Error(`Unexpected ${url}`);
    }) as typeof fetch;
    await value.accessToken(account.id,"email.read");
    expect(value.get(account.id)?.grantedScopes).toContain(GMAIL_READ);expect(value.get(account.id)?.capabilities).toEqual(["email.read"]);
  });
});
