import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectionResolution, OAuthConfiguration } from "@nexo/shared";
import type { NexoDatabase } from "../database/db.js";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus, OAuthHost, SecretStore } from "./types.js";
import { TokenManager } from "../auth/token-manager.js";
import { environment } from "../config/environment.js";
import { OAuthCredentialService } from "./oauth-credential-service.js";

const OAUTH_HTTP_TIMEOUT_MS = 30_000;
const GOOGLE_GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const GOOGLE_CALENDAR_PROBE = "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1";

const GOOGLE_SCOPE_BY_CAPABILITY: Record<ConnectionCapability,string> = {
  "email.read":"https://www.googleapis.com/auth/gmail.readonly",
  "email.send":"https://www.googleapis.com/auth/gmail.send",
  "email.modify":"https://www.googleapis.com/auth/gmail.modify",
  "calendar.read":"https://www.googleapis.com/auth/calendar.readonly",
  "calendar.write":"https://www.googleapis.com/auth/calendar"
};
const MICROSOFT_SCOPE_BY_CAPABILITY: Record<ConnectionCapability,string> = {
  "email.read":"Mail.Read",
  "email.send":"Mail.Send",
  "email.modify":"Mail.ReadWrite",
  "calendar.read":"Calendars.Read",
  "calendar.write":"Calendars.ReadWrite"
};

type ConnectionRow = {
  id:string;provider:ConnectionProvider;account_email?:string;display_name?:string;capabilities_json:string;status:ConnectionStatus;last_error?:string;updated_at:string;
  last_connected_at?:string;last_validated_at?:string;last_refresh_at?:string;token_expires_at?:string;provider_account_id?:string;
  requested_capabilities_json?:string;granted_scopes_json?:string;last_health_check_at?:string;reauthorization_reason?:string;token_secret_key?:string;
};
type OAuthTokens = Record<string,unknown> & { access_token:string;refresh_token?:string;expires_at?:string;expires_in?:number;scope?:string };
type ProviderProfile = { id?:string;email?:string;name?:string };

export class ConnectionService {
  private readonly tokenManager:TokenManager;
  readonly oauthCredentials:OAuthCredentialService;

  constructor(
    private db:NexoDatabase,
    private secrets:SecretStore,
    private oauthHost?:OAuthHost,
    private oauthConfiguration?:()=>OAuthConfiguration,
    private readonly connectionsEnabled=()=>true,
    oauthCredentials?:OAuthCredentialService
  ) {
    this.ensureMetadataColumns();
    this.oauthCredentials=oauthCredentials??new OAuthCredentialService(secrets);
    this.tokenManager=new TokenManager(secrets,()=>this.resolveConfiguration(),this.oauthCredentials);
  }

  list():ConnectionAccount[] {
    return this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY updated_at DESC").map(row=>this.toAccount(row));
  }

  get(id:string) {
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);
    return row?this.toAccount(row):undefined;
  }

  defaultFor(capability:ConnectionCapability) {
    const resolution=this.resolveForCapability(capability);
    return resolution.status==="ready"?resolution.account:undefined;
  }

  resolveForCapability(capability:ConnectionCapability):ConnectionResolution {
    const accounts=this.list();
    const ready=accounts.find(account=>account.status==="connected"&&account.capabilities.includes(capability));
    if(ready)return{status:"ready",account:ready};
    if(!accounts.length)return{status:"not_connected"};
    const reauth=accounts.find(account=>account.status==="reauthorization-required"||Boolean(account.reauthorizationReason));
    if(reauth)return{status:"needs_reauthorization",account:reauth};
    const expired=accounts.find(account=>account.status==="expired");
    if(expired)return{status:"expired",account:expired};
    const connected=accounts.find(account=>account.status==="connected");
    if(connected)return{status:"missing_capability",account:connected};
    return{status:"not_connected"};
  }

  async hasGoogleClientSecret(){return this.oauthCredentials.hasGoogleClientSecret();}
  async saveGoogleClientSecret(value:string){await this.oauthCredentials.saveGoogleClientSecret(value);return{configured:true};}
  async deleteGoogleClientSecret(){await this.oauthCredentials.deleteGoogleClientSecret();for(const account of this.list().filter(item=>item.provider==="google"))this.markReauthorizationRequired(account.id,"O Client Secret do Google foi removido.");return{configured:false};}

  async connect(provider:ConnectionProvider,requestedCapabilities:ConnectionCapability[]) {
    this.assertEnabled();
    const capabilities=[...new Set(requestedCapabilities)];
    if(!capabilities.length)throw new Error("Selecione ao menos uma capacidade.");
    const configuration=this.resolveConfiguration();
    const clientId=provider==="google"?configuration.googleClientId:configuration.microsoftClientId;
    const providerName=providerLabel(provider);
    if(!clientId)throw new Error(`Configure o Client ID OAuth de ${providerName} em Conexões antes de conectar.`);
    const clientSecret=provider==="google"?await this.oauthCredentials.getGoogleClientSecret():null;
    if(!this.oauthHost?.startLoopbackCallback)throw new Error("O host OAuth desta instalação não suporta callback local.");

    const id=randomUUID(),now=new Date().toISOString(),secretKey=`connection:${id}:tokens`;
    const state=randomBytes(24).toString("base64url"),verifier=randomBytes(48).toString("base64url"),challenge=createHash("sha256").update(verifier).digest("base64url");
    let callback:Awaited<ReturnType<NonNullable<OAuthHost["startLoopbackCallback"]>>>;
    try{callback=await this.oauthHost.startLoopbackCallback({state,timeoutMs:environment().oauthCallbackTimeoutMs});}
    catch(error){throw oauthStageError(provider,"preparando o callback local",error);}

    const requestedScopes=provider==="google"?googleScopes(capabilities):microsoftScopes(capabilities);
    const authorization=provider==="google"
      ?`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:clientId,redirect_uri:callback.redirectUri,response_type:"code",access_type:"offline",prompt:"consent",include_granted_scopes:"true",scope:requestedScopes.join(" "),state,code_challenge:challenge,code_challenge_method:"S256"})}`
      :`https://login.microsoftonline.com/${configuration.microsoftTenant}/oauth2/v2.0/authorize?${new URLSearchParams({client_id:clientId,redirect_uri:callback.redirectUri,response_type:"code",response_mode:"query",scope:requestedScopes.join(" "),state,code_challenge:challenge,code_challenge_method:"S256"})}`;
    try{await this.oauthHost.openExternal(authorization);}catch(error){throw oauthStageError(provider,"abrindo o navegador",error);}

    let response:URL;
    try{response=await callback.callback;}catch(error){throw oauthStageError(provider,"aguardando a autorização no navegador",error);}
    const code=response.searchParams.get("code"),denied=response.searchParams.get("error");
    if(!code)throw new Error(oauthErrorMessage(provider,denied,response.searchParams.get("error_description")));

    let tokens:OAuthTokens;
    try{tokens=await exchangeAuthorizationCode({provider,configuration,clientId,clientSecret:clientSecret??undefined,code,verifier,redirectUri:callback.redirectUri});}
    catch(error){throw oauthStageError(provider,"trocando a autorização por tokens",error);}
    if(provider==="google"&&!tokens.refresh_token)throw oauthStageError(provider,"confirmando a sessão persistente",new Error("O Google não retornou refresh_token. Revogue o acesso antigo do Nexo na Conta Google e conecte novamente para permitir acesso offline."));

    let profile:ProviderProfile;
    try{profile=await getProfile(provider,tokens.access_token);}catch(error){throw oauthStageError(provider,"validando a conta autorizada",error);}

    const grantedScopes=parseGrantedScopes(tokens.scope,requestedScopes);
    const grantedCapabilities=capabilities.filter(capability=>scopeAllows(provider,grantedScopes,capability));
    const missing=capabilities.filter(capability=>!grantedCapabilities.includes(capability));
    if(missing.length)throw oauthStageError(provider,"confirmando as permissões concedidas",new Error(`O provedor não concedeu: ${missing.join(", ")}. Autorize novamente marcando as permissões solicitadas.`));
    try{await probeCapabilities(provider,tokens.access_token,grantedCapabilities);}catch(error){throw oauthStageError(provider,"validando o acesso às APIs autorizadas",error);}

    const storedTokens=TokenManager.withExpiry(tokens) as OAuthTokens;
    try{await this.secrets.set(secretKey,JSON.stringify(storedTokens));}
    catch(error){throw oauthStageError(provider,"salvando a credencial segura no computador",error);}

    try{
      this.db.run(
        "INSERT INTO connections(id,provider,account_email,display_name,capabilities_json,token_secret_key,status,created_at,updated_at,last_error,last_connected_at,last_validated_at,token_expires_at,provider_account_id,requested_capabilities_json,granted_scopes_json,last_health_check_at,reauthorization_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id,provider,profile.email??null,profile.name??null,JSON.stringify(grantedCapabilities),secretKey,"connected",now,now,null,now,now,storedTokens.expires_at??null,profile.id??null,JSON.stringify(capabilities),JSON.stringify(grantedScopes),now,null]
      );
    }catch(error){await this.secrets.delete(secretKey).catch(()=>undefined);throw oauthStageError(provider,"registrando a conexão no Nexo",error);}
    const account=this.get(id);
    if(!account){await this.secrets.delete(secretKey).catch(()=>undefined);throw oauthStageError(provider,"confirmando a conexão salva",new Error("O registro da conexão não pôde ser lido após o salvamento."));}
    return account;
  }

  async restoreConnections() {
    for(const row of this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY updated_at DESC")) {
      if(!row.token_secret_key)continue;
      try{
        const state=await this.tokenManager.state(row.token_secret_key);
        if(!state.exists||!state.hasAccessToken){this.markReauthorizationRequired(row.id,"A credencial segura da conta não está disponível neste computador.");continue;}
        if(state.expired) {
          if(!state.hasRefreshToken){this.db.run("UPDATE connections SET status='expired',last_error=?,updated_at=? WHERE id=?",["O token expirou e não existe refresh_token.",new Date().toISOString(),row.id]);continue;}
          await this.forceRefreshToken(row.id);
        } else {
          this.db.run("UPDATE connections SET status='connected',last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[new Date().toISOString(),row.id]);
        }
      } catch(error) {
        const message=error instanceof Error?error.message:String(error);
        if(/client secret|refresh_token|refresh token|reconecte|revogad/i.test(message))this.markReauthorizationRequired(row.id,message);
        else this.db.run("UPDATE connections SET last_error=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),row.id]);
      }
    }
    return this.list();
  }

  async disconnect(id:string) {
    const row=this.db.get<{token_secret_key:string}>("SELECT token_secret_key FROM connections WHERE id=?",[id]);
    if(!row)return;
    await this.secrets.delete(row.token_secret_key);
    this.db.run("DELETE FROM connections WHERE id=?",[id]);
  }

  async addCapabilities(id:string,capabilities:ConnectionCapability[]) {
    const existing=this.get(id);if(!existing)throw new Error("Conexão não encontrada.");
    const expanded=[...new Set([...(existing.requestedCapabilities??existing.capabilities),...capabilities])];
    const missing=expanded.filter(capability=>!existing.capabilities.includes(capability));if(!missing.length&&existing.status==="connected")return existing;
    const reauthorized=await this.connect(existing.provider,expanded);
    const next=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[reauthorized.id])!;
    const previous=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id])!;
    const now=new Date().toISOString();
    this.db.run(
      "UPDATE connections SET account_email=?,display_name=?,capabilities_json=?,token_secret_key=?,status=?,last_error=NULL,last_connected_at=?,last_validated_at=?,last_refresh_at=?,token_expires_at=?,provider_account_id=?,requested_capabilities_json=?,granted_scopes_json=?,last_health_check_at=?,reauthorization_reason=NULL,updated_at=? WHERE id=?",
      [next.account_email??null,next.display_name??null,next.capabilities_json,next.token_secret_key,next.status,next.last_connected_at??now,next.last_validated_at??now,next.last_refresh_at??null,next.token_expires_at??null,next.provider_account_id??null,next.requested_capabilities_json??JSON.stringify(expanded),next.granted_scopes_json??"[]",next.last_health_check_at??now,now,id]
    );
    this.db.run("DELETE FROM connections WHERE id=?",[reauthorized.id]);
    if(previous.token_secret_key)await this.secrets.delete(previous.token_secret_key);
    return this.get(id)!;
  }

  async test(id:string) {
    const account=this.get(id);if(!account)throw new Error("Conexão não encontrada.");
    const capability=account.capabilities[0]??account.requestedCapabilities?.[0];
    if(!capability)throw new Error("A conexão não possui permissões configuradas.");
    try{
      const token=await this.accessToken(id,capability);
      const profile=await getProfile(account.provider,token);
      await probeCapabilities(account.provider,token,account.capabilities);
      const now=new Date().toISOString();
      this.db.run("UPDATE connections SET account_email=COALESCE(?,account_email),display_name=COALESCE(?,display_name),provider_account_id=COALESCE(?,provider_account_id),last_validated_at=?,last_health_check_at=?,status='connected',last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[profile.email??null,profile.name??null,profile.id??null,now,now,now,id]);
      return this.get(id)!;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(/permiss|scope|revog|reconecte|client secret/i.test(message))this.markReauthorizationRequired(id,message);else this.db.run("UPDATE connections SET last_error=?,last_health_check_at=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),new Date().toISOString(),id]);
      throw error;
    }
  }

  async accessToken(id:string,capability:ConnectionCapability) {
    this.assertEnabled();
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);
    if(!row)throw new Error("A conexão não foi encontrada.");
    if(row.status==="expired"||row.status==="reauthorization-required")throw new Error(row.reauthorization_reason||row.last_error||"A conexão precisa ser autorizada novamente.");
    if(!safeCapabilities(row.capabilities_json).includes(capability))throw new Error(`A conta conectada não possui a permissão necessária: ${capability}.`);
    if(!row.token_secret_key)throw new Error("A credencial segura não está disponível. Reconecte a conta.");
    try{
      const token=await this.tokenManager.accessToken(row.provider,row.token_secret_key);
      if(token.refreshed){const now=new Date().toISOString();this.db.run("UPDATE connections SET status='connected',last_refresh_at=?,token_expires_at=?,last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[now,token.expiresAt??null,now,id]);}
      return token.accessToken;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(/client secret|refresh_token|refresh token|reconecte|revogad/i.test(message))this.markReauthorizationRequired(id,message);else this.db.run("UPDATE connections SET last_error=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),id]);
      throw error;
    }
  }

  async forceRefreshToken(id:string) {
    this.assertEnabled();
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);
    if(!row?.token_secret_key)throw new Error("A conexão não possui credencial persistida.");
    try{
      this.db.run("UPDATE connections SET status='refreshing',updated_at=? WHERE id=?",[new Date().toISOString(),id]);
      const token=await this.tokenManager.forceRefresh(row.provider,row.token_secret_key);
      const now=new Date().toISOString();
      this.db.run("UPDATE connections SET status='connected',last_refresh_at=?,token_expires_at=?,last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[now,token.expiresAt??null,now,id]);
      return token;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(/client secret|refresh_token|refresh token|reconecte|revogad/i.test(message))this.markReauthorizationRequired(id,message);else this.db.run("UPDATE connections SET status='connected',last_error=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),id]);
      throw error;
    }
  }

  markReauthorizationRequired(id:string,reason:string) {
    this.db.run("UPDATE connections SET status='reauthorization-required',last_error=?,reauthorization_reason=?,updated_at=? WHERE id=?",[reason,reason,new Date().toISOString(),id]);
  }

  private resolveConfiguration():OAuthConfiguration {
    const saved=this.oauthConfiguration?.(),env=environment();
    return{googleClientId:saved?.googleClientId.trim()||env.googleClientId,microsoftClientId:saved?.microsoftClientId.trim()||env.microsoftClientId,microsoftTenant:saved?.microsoftTenant.trim()||env.microsoftTenant};
  }
  private assertEnabled(){if(!this.connectionsEnabled())throw new Error("Conexões externas ficam desativadas no modo privado.");}

  private ensureMetadataColumns() {
    const columns=new Set(this.db.all<{name:string}>("PRAGMA table_info(connections)").map(column=>String(column.name)));
    const additions:[string,string][]=[
      ["requested_capabilities_json","TEXT"],["granted_scopes_json","TEXT"],["last_health_check_at","TEXT"],["reauthorization_reason","TEXT"]
    ];
    for(const[name,type]of additions)if(!columns.has(name))this.db.run(`ALTER TABLE connections ADD COLUMN ${name} ${type}`);
  }

  private toAccount(row:ConnectionRow):ConnectionAccount {
    const capabilities=safeCapabilities(row.capabilities_json);
    return{id:row.id,provider:row.provider,accountEmail:row.account_email,displayName:row.display_name,capabilities,requestedCapabilities:safeCapabilities(row.requested_capabilities_json??row.capabilities_json),grantedScopes:safeStringArray(row.granted_scopes_json),status:row.status,lastError:row.last_error,updatedAt:row.updated_at,lastConnectedAt:row.last_connected_at,lastValidatedAt:row.last_validated_at,lastRefreshAt:row.last_refresh_at,tokenExpiresAt:row.token_expires_at,providerAccountId:row.provider_account_id,lastHealthCheckAt:row.last_health_check_at,reauthorizationReason:row.reauthorization_reason};
  }
}

const googleScopes=(items:ConnectionCapability[])=>[...new Set(["openid","email","profile",...items.map(item=>GOOGLE_SCOPE_BY_CAPABILITY[item])])];
const microsoftScopes=(items:ConnectionCapability[])=>[...new Set(["openid","profile","offline_access","User.Read",...items.map(item=>MICROSOFT_SCOPE_BY_CAPABILITY[item])])];

function parseGrantedScopes(scope:string|undefined,fallback:string[]){return[...new Set((scope?.trim()?scope.trim().split(/\s+/):fallback).filter(Boolean))];}
function scopeAllows(provider:ConnectionProvider,scopes:string[],capability:ConnectionCapability){
  const set=new Set(scopes);
  if(provider==="microsoft"){
    const wanted=MICROSOFT_SCOPE_BY_CAPABILITY[capability];
    if(set.has(wanted))return true;
    if(capability==="email.read"&&set.has("Mail.ReadWrite"))return true;
    if(capability==="calendar.read"&&set.has("Calendars.ReadWrite"))return true;
    return false;
  }
  const wanted=GOOGLE_SCOPE_BY_CAPABILITY[capability];
  if(set.has(wanted)||set.has("https://mail.google.com/"))return true;
  if(capability==="email.read"&&set.has(GOOGLE_SCOPE_BY_CAPABILITY["email.modify"]))return true;
  if(capability==="email.send"&&set.has(GOOGLE_SCOPE_BY_CAPABILITY["email.modify"]))return true;
  if(capability==="calendar.read"&&set.has(GOOGLE_SCOPE_BY_CAPABILITY["calendar.write"]))return true;
  return false;
}

async function exchangeAuthorizationCode({provider,configuration,clientId,clientSecret,code,verifier,redirectUri}:{provider:ConnectionProvider;configuration:OAuthConfiguration;clientId:string;clientSecret?:string;code:string;verifier:string;redirectUri:string}):Promise<OAuthTokens>{
  const tokenUrl=provider==="google"?"https://oauth2.googleapis.com/token":`https://login.microsoftonline.com/${configuration.microsoftTenant}/oauth2/v2.0/token`;
  const params=new URLSearchParams({client_id:clientId,code,redirect_uri:redirectUri,grant_type:"authorization_code",code_verifier:verifier});
  if(provider==="google"&&clientSecret)params.set("client_secret",clientSecret);
  const tokenResponse=await fetch(tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params,signal:AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)});
  const tokens=await safeJson(tokenResponse);
  if(!tokenResponse.ok||typeof tokens.access_token!=="string")throw new Error(oauthErrorMessage(provider,typeof tokens.error==="string"?tokens.error:String(tokens.error??""),typeof tokens.error_description==="string"?tokens.error_description:undefined));
  return tokens as OAuthTokens;
}

async function getProfile(provider:ConnectionProvider,token:string):Promise<ProviderProfile>{
  const url=provider==="google"?"https://openidconnect.googleapis.com/v1/userinfo":"https://graph.microsoft.com/v1.0/me";
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)});
  if(!response.ok)throw new Error(`O provedor recusou a validação da conta (HTTP ${response.status}).`);
  const value=await response.json() as Record<string,unknown>,email=firstString(value.email,value.mail,value.userPrincipalName),name=firstString(value.name,value.displayName),id=firstString(value.id,value.sub);
  if(provider==="google"&&!email)throw new Error("O Google autorizou o acesso, mas não retornou o e-mail da conta.");
  return{id,email,name};
}

async function probeCapabilities(provider:ConnectionProvider,token:string,capabilities:ConnectionCapability[]){
  if(provider!=="google")return;
  const headers={Authorization:`Bearer ${token}`};
  if(capabilities.some(capability=>capability==="email.read"||capability==="email.modify")){
    const gmail=await fetch(GOOGLE_GMAIL_PROFILE,{headers,signal:AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)});
    if(!gmail.ok)throw new Error(await googleProbeMessage(gmail,"Gmail"));
  }
  if(capabilities.some(capability=>capability==="calendar.read"||capability==="calendar.write")){
    const calendar=await fetch(GOOGLE_CALENDAR_PROBE,{headers,signal:AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)});
    if(!calendar.ok)throw new Error(await googleProbeMessage(calendar,"Google Calendar"));
  }
}
async function googleProbeMessage(response:Response,service:string){const body=await safeJson(response);const raw=JSON.stringify(body).toLowerCase();if(response.status===403&&/(insufficient|scope|permission)/.test(raw))return`${service}: a permissão OAuth concedida é insuficiente.`;if(response.status===403&&/(accessnotconfigured|disabled|has not been used)/.test(raw))return`${service}: a API não está habilitada no projeto Google Cloud.`;return`${service}: o Google recusou a validação (HTTP ${response.status}).`;}
async function safeJson(response:Response):Promise<Record<string,unknown>>{try{return await response.json() as Record<string,unknown>;}catch{return{};}}
function firstString(...values:unknown[]){return values.find(value=>typeof value==="string"&&value.length>0) as string|undefined;}
function providerLabel(provider:ConnectionProvider){return provider==="google"?"Google":"Microsoft";}
function safeCapabilities(value:string){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>["email.read","email.send","email.modify","calendar.read","calendar.write"].includes(item)) as ConnectionCapability[]:[];}catch{return[];}}
function safeStringArray(value?:string){if(!value)return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>typeof item==="string") as string[]:[];}catch{return[];}}
function oauthStageError(provider:ConnectionProvider,stage:string,error:unknown){const message=error instanceof Error?error.message:String(error);if(error instanceof DOMException&&(error.name==="TimeoutError"||error.name==="AbortError"))return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: a operação excedeu o tempo limite.`);return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: ${message}`);}
function oauthErrorMessage(provider:ConnectionProvider,code?:string|null,description?:string|null){const normalizedCode=(code??"").toLowerCase(),value=`${code??""} ${description??""}`.toLowerCase(),providerName=providerLabel(provider);if(normalizedCode==="admin_consent_required"||value.includes("admin consent"))return"Sua organização exige aprovação do administrador para estas permissões.";if(value.includes("redirect_uri_mismatch")||value.includes("aadsts50011"))return"O callback OAuth não foi aceito. Use uma credencial de aplicativo desktop e permita o redirect de loopback http://127.0.0.1 no provedor.";if(normalizedCode==="invalid_client"||value.includes("client_secret is missing"))return`${providerName} recusou as credenciais OAuth. Confirme Client ID e Client Secret do mesmo aplicativo desktop.`;if(normalizedCode==="invalid_grant")return`${providerName} recusou o código de autorização. Tente conectar novamente; se persistir, revogue o acesso anterior e autorize de novo.`;if(value.includes("invalid_scope"))return"Uma ou mais permissões solicitadas não estão configuradas ou aprovadas no provedor.";if(value.includes("access_denied"))return provider==="google"?"O acesso foi recusado. Verifique a tela de consentimento, os usuários de teste e as permissões Google.":"O acesso foi recusado. Verifique o consentimento e as permissões delegadas no Microsoft Entra.";const detail=description?.trim();if(detail)return`${providerName} recusou a autorização: ${detail.slice(0,400)}`;return"A autorização foi recusada ou não retornou um código válido.";}
