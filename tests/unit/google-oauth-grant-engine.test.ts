import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import type { OAuthHost,SecretStore } from "../../packages/core/src/connections/types.js";

class RecordingSecretStore implements SecretStore {
  values=new Map<string,string>();
  async set(key:string,value:string){this.values.set(key,value);}
  async get(key:string){return this.values.get(key)??null;}
  async delete(key:string){this.values.delete(key);}
}

let root:string;let db:NexoDatabase;let secrets:RecordingSecretStore;let originalFetch:typeof fetch;
const CLIENT_ID="desktop-client.apps.googleusercontent.com";
const GMAIL_MODIFY="https://www.googleapis.com/auth/gmail.modify";
const GMAIL_SEND="https://www.googleapis.com/auth/gmail.send";
const CALENDAR="https://www.googleapis.com/auth/calendar";

beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-google-grants-"));db=new NexoDatabase(root);await db.ready();secrets=new RecordingSecretStore();originalFetch=globalThis.fetch;});
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});});

function host(onOpen:(url:string)=>void=()=>undefined):OAuthHost{return{openExternal:async url=>onOpen(url),waitForLoopbackCallback:async({state})=>new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`),startLoopbackCallback:async({state})=>({redirectUri:"http://127.0.0.1:4567/oauth/callback",callback:Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))})};}
async function service(onOpen:(url:string)=>void=()=>undefined){const value=new ConnectionService(db,secrets,host(onOpen),()=>({googleClientId:CLIENT_ID,microsoftClientId:"",microsoftTenant:"common"}),()=>true);await value.saveGoogleClientSecret("GOCSPX-test-secret");return value;}

function mockGoogle(options:{tokenScope?:string;tokenInfoScope?:string;issuedTo?:string;gmailStatus?:number;calendarStatus?:number}){
  globalThis.fetch=vi.fn(async(input:string|URL)=>{
    const url=String(input);
    if(url.includes("oauth2.googleapis.com/token")&&!url.includes("tokeninfo"))return new Response(JSON.stringify({access_token:"access",refresh_token:"refresh",expires_in:3600,...(options.tokenScope?{scope:options.tokenScope}:{})}),{status:200});
    if(url.includes("oauth2.googleapis.com/tokeninfo"))return new Response(JSON.stringify({issued_to:options.issuedTo??CLIENT_ID,scope:options.tokenInfoScope??options.tokenScope??"openid email profile",email:"person@example.com",expires_in:3600}),{status:200});
    if(url.includes("openidconnect.googleapis.com/v1/userinfo"))return new Response(JSON.stringify({sub:"user",email:"person@example.com",name:"Person"}),{status:200});
    if(url.includes("gmail.googleapis.com"))return new Response(JSON.stringify(options.gmailStatus&&options.gmailStatus!==200?{error:{message:"Request had insufficient authentication scopes.",errors:[{reason:"insufficientPermissions"}]}}:{emailAddress:"person@example.com"}),{status:options.gmailStatus??200});
    if(url.includes("calendar/v3"))return new Response(JSON.stringify(options.calendarStatus&&options.calendarStatus!==200?{error:{message:"Request had insufficient authentication scopes.",errors:[{reason:"insufficientPermissions"}]}}:{items:[]}),{status:options.calendarStatus??200});
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
}

describe("Google OAuth grant engine",()=>{
  it("normalizes broad requested capabilities to the minimum useful scopes and validates all grants",async()=>{
    let authorization="";
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_MODIFY} ${CALENDAR}`});
    const value=await service(url=>{authorization=url;});
    const account=await value.connect("google",["email.read","email.send","email.modify","calendar.read","calendar.write"]);
    const authUrl=new URL(authorization),scope=authUrl.searchParams.get("scope")??"";
    expect(scope).toContain(GMAIL_MODIFY);expect(scope).toContain(CALENDAR);
    expect(scope).not.toContain("gmail.readonly");expect(scope).not.toContain(GMAIL_SEND);
    expect(account.status).toBe("connected");
    expect(account.capabilities).toEqual(expect.arrayContaining(["email.read","email.send","email.modify","calendar.read","calendar.write"]));
    expect(account.capabilityGrants?.every(grant=>grant.validated)).toBe(true);
  });

  it("uses tokeninfo when the token response omits scope",async()=>{
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_MODIFY}`});
    const value=await service();const account=await value.connect("google",["email.read","email.modify"]);
    expect(account.status).toBe("connected");expect(account.scopeSource).toBe("token-info");expect(account.grantedScopes).toContain(GMAIL_MODIFY);
  });

  it("models the reported gmail.send-only scenario as degraded instead of falsely connected",async()=>{
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_SEND}`});
    const value=await service();const account=await value.connect("google",["email.read","email.send","email.modify","calendar.read","calendar.write"]);
    expect(account.status).toBe("degraded");expect(account.capabilities).toEqual(["email.send"]);
    expect(account.capabilityGrants?.find(grant=>grant.capability==="email.send")?.status).toBe("validated");
    expect(account.capabilityGrants?.find(grant=>grant.capability==="email.read")?.providerReason).toBe("missing_scope");
  });

  it("distinguishes scope granted from an API that still refuses the request",async()=>{
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_MODIFY}`,gmailStatus:403});
    const value=await service();const account=await value.connect("google",["email.read","email.send","email.modify"]);
    expect(account.status).toBe("degraded");expect(account.capabilities).toEqual(["email.send"]);
    const read=account.capabilityGrants?.find(grant=>grant.capability==="email.read");
    expect(read?.granted).toBe(true);expect(read?.validated).toBe(false);expect(read?.providerReason).toBe("scope_present_api_denied");
    expect(read?.providerMessage).toMatch(/mesmo projeto Google Cloud/i);
  });

  it("rejects a token emitted for another OAuth client",async()=>{
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_MODIFY}`,issuedTo:"another-client.apps.googleusercontent.com"});
    const value=await service();
    await expect(value.connect("google",["email.read"])).rejects.toThrow(/Client ID diferente/i);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
    expect([...secrets.values.keys()].filter(key=>key.startsWith("connection:"))).toEqual([]);
  });

  it("preserves the old connection when a replacement authorization grants no requested capability",async()=>{
    mockGoogle({tokenInfoScope:`openid email profile ${GMAIL_MODIFY}`});
    const value=await service();const original=await value.connect("google",["email.read"]);
    mockGoogle({tokenInfoScope:"openid email profile"});
    await expect(value.setRequestedCapabilities(original.id,["email.read","calendar.read"])).rejects.toThrow(/não substituiu/i);
    const preserved=value.get(original.id);
    expect(preserved?.capabilities).toContain("email.read");expect(preserved?.status).toBe("connected");
  });
});
