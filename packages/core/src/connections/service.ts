import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isCapabilityOperational, type CapabilityGrant, type ConnectionDiagnosticSnapshot, type ConnectionResolution, type OAuthConfiguration } from "@nexo/shared";
import type { NexoDatabase } from "../database/db.js";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus, OAuthHost, SecretStore } from "./types.js";
import { TokenManager } from "../auth/token-manager.js";
import { environment } from "../config/environment.js";
import { OAuthCredentialService } from "./oauth-credential-service.js";
import { normalizeGoogleScopes } from "./google/scope-policy.js";
import { inspectGoogleGrant, parseScopes, type GoogleGrantSnapshot, type GoogleScopeSource } from "./google/grant-inspector.js";
import { validateGoogleCapabilities } from "./google/capability-validator.js";
import { connectionStatusFromGrants, safeGrantForLog, summarizeGrantFailures } from "./google/diagnostics.js";

const OAUTH_HTTP_TIMEOUT_MS = 30_000;
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
  oauth_client_id?:string;scope_source?:GoogleScopeSource;
};
type CapabilityGrantRow = {
  connection_id:string;capability:ConnectionCapability;requested:number;expected_scopes_json:string;granted:number;granted_scope?:string;validated:number;
  status:CapabilityGrant["status"];validation_source?:CapabilityGrant["validationSource"];provider_reason?:string;provider_message?:string;http_status?:number;last_validated_at?:string;
};
type OAuthTokens = Record<string,unknown> & { access_token:string;refresh_token?:string;expires_at?:string;expires_in?:number;scope?:string };
type ProviderProfile = { id?:string;email?:string;name?:string };
export type OAuthDiagnosticLogger = (diagnostic:CapabilityGrant)=>void;

export class ConnectionService {
  private readonly tokenManager:TokenManager;
  readonly oauthCredentials:OAuthCredentialService;

  constructor(
    private db:NexoDatabase,
    private secrets:SecretStore,
    private oauthHost?:OAuthHost,
    private oauthConfiguration?:()=>OAuthConfiguration,
    private readonly connectionsEnabled=()=>true,
    oauthCredentials?:OAuthCredentialService,
    private readonly logOAuthDiagnostic:OAuthDiagnosticLogger=defaultOAuthDiagnosticLogger
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
    const ready=accounts.find(account=>(account.status==="connected"||account.status==="degraded")&&account.capabilities.includes(capability));
    if(ready)return{status:"ready",account:ready};
    if(!accounts.length)return{status:"not_connected"};
    const reauth=accounts.find(account=>account.status==="reauthorization-required"||Boolean(account.reauthorizationReason));
    if(reauth)return{status:"needs_reauthorization",account:reauth};
    const expired=accounts.find(account=>account.status==="expired");
    if(expired)return{status:"expired",account:expired};
    const connected=accounts.find(account=>account.status==="connected"||account.status==="degraded");
    if(connected)return{status:"missing_capability",account:connected};
    return{status:"not_connected"};
  }

  async hasGoogleClientSecret(){return this.oauthCredentials.hasGoogleClientSecret();}
  async saveGoogleClientSecret(value:string){await this.oauthCredentials.saveGoogleClientSecret(value);return{configured:true};}
  async deleteGoogleClientSecret(){await this.oauthCredentials.deleteGoogleClientSecret();for(const account of this.list().filter(item=>item.provider==="google"))this.markReauthorizationRequired(account.id,"O Client Secret do Google foi removido.");return{configured:false};}

  async connect(provider:ConnectionProvider,requestedCapabilities:ConnectionCapability[]) {
    this.assertEnabled();
    const capabilities=uniqueCapabilities(requestedCapabilities);
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

    const requestedScopes=provider==="google"?normalizeGoogleScopes(capabilities):microsoftScopes(capabilities);
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

    let operationalCapabilities:ConnectionCapability[];
    let grantedScopes:string[];
    let status:ConnectionStatus="connected";
    let grants:CapabilityGrant[]=[];
    let scopeSource:GoogleScopeSource|undefined;
    let lastError:string|undefined;

    if(provider==="google"){
      let snapshot:GoogleGrantSnapshot;
      try{snapshot=await inspectGoogleGrant({accessToken:tokens.access_token,tokenScope:tokens.scope,configuredClientId:clientId});}
      catch(error){throw oauthStageError(provider,"inspecionando as permissões efetivamente concedidas",error);}
      grantedScopes=snapshot.scopes;
      scopeSource=snapshot.scopeSource;
      const validation=await validateGoogleCapabilities({accessToken:tokens.access_token,requestedCapabilities:capabilities,grantedScopes,scopeSource:snapshot.scopeSource});
      grants=validation.grants;
      grants.forEach(grant=>this.logOAuthDiagnostic(safeGrantForLog(grant)));
      operationalCapabilities=validation.operationalCapabilities;
      status=connectionStatusFromGrants(capabilities,grants);
      lastError=summarizeGrantFailures(grants);
      if(operationalCapabilities.length===0){
        const detail=lastError??"Nenhuma permissão Google foi validada pelas APIs do provedor.";
        throw oauthStageError(provider,"validando as permissões solicitadas",new Error(`${detail}\nNenhuma capability foi ativada; autorize novamente após corrigir Google Cloud → Google Auth Platform → Data Access.`));
      }
    }else{
      grantedScopes=parseScopes(tokens.scope);
      operationalCapabilities=capabilities.filter(capability=>microsoftScopeAllows(grantedScopes,capability));
      const missing=capabilities.filter(capability=>!operationalCapabilities.includes(capability));
      if(missing.length)throw oauthStageError(provider,"confirmando as permissões concedidas",new Error(`O provedor não concedeu: ${missing.join(", ")}. Autorize novamente marcando as permissões solicitadas.`));
    }

    const storedTokens=TokenManager.withExpiry(tokens) as OAuthTokens;
    try{await this.secrets.set(secretKey,JSON.stringify(storedTokens));}
    catch(error){throw oauthStageError(provider,"salvando a credencial segura no computador",error);}

    try{
      this.db.transaction(()=>{
        this.db.run(
          "INSERT INTO connections(id,provider,account_email,display_name,capabilities_json,token_secret_key,status,created_at,updated_at,last_error,last_connected_at,last_validated_at,token_expires_at,provider_account_id,requested_capabilities_json,granted_scopes_json,last_health_check_at,reauthorization_reason,oauth_client_id,scope_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [id,provider,profile.email??null,profile.name??null,JSON.stringify(operationalCapabilities),secretKey,status,now,now,lastError??null,now,now,storedTokens.expires_at??null,profile.id??null,JSON.stringify(capabilities),JSON.stringify(grantedScopes),now,status==="reauthorization-required"?lastError??"A autorização precisa ser refeita.":null,provider==="google"?clientId:null,scopeSource??null]
        );
        if(provider==="google")this.replaceCapabilityGrants(id,grants);
      });
    }catch(error){await this.secrets.delete(secretKey).catch(()=>undefined);throw oauthStageError(provider,"registrando a conexão no Nexo",error);}
    const account=this.get(id);
    if(!account){await this.secrets.delete(secretKey).catch(()=>undefined);throw oauthStageError(provider,"confirmando a conexão salva",new Error("O registro da conexão não pôde ser lido após o salvamento."));}
    return account;
  }

  async restoreConnections() {
    for(const row of this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY updated_at DESC")) {
      if(!row.token_secret_key)continue;
      if(row.status==="reauthorization-required"||row.reauthorization_reason)continue;
      try{
        if(row.provider==="google"&&row.oauth_client_id){
          const configured=this.resolveConfiguration().googleClientId;
          if(configured&&configured!==row.oauth_client_id){this.markReauthorizationRequired(row.id,"O Client ID do Google foi alterado desde que esta conta foi autorizada.");continue;}
        }
        const state=await this.tokenManager.state(row.token_secret_key);
        if(!state.exists||!state.hasAccessToken){this.markReauthorizationRequired(row.id,"A credencial segura da conta não está disponível neste computador.");continue;}
        if(state.expired) {
          if(!state.hasRefreshToken){this.db.run("UPDATE connections SET status='expired',last_error=?,updated_at=? WHERE id=?",["O token expirou e não existe refresh_token.",new Date().toISOString(),row.id]);continue;}
          await this.forceRefreshToken(row.id);
        } else {
          const restoredStatus=row.provider==="google"?this.statusFromPersistedGrants(row):"connected";
          this.db.run("UPDATE connections SET status=?,updated_at=? WHERE id=?",[restoredStatus,new Date().toISOString(),row.id]);
        }
      } catch(error) {
        const message=error instanceof Error?error.message:String(error);
        if(/client secret|refresh_token|refresh token|reconecte|revogad|client id/i.test(message))this.markReauthorizationRequired(row.id,message);
        else this.db.run("UPDATE connections SET last_error=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),row.id]);
      }
    }
    return this.list();
  }

  async disconnect(id:string) {
    const row=this.db.get<{token_secret_key:string}>("SELECT token_secret_key FROM connections WHERE id=?",[id]);
    if(!row)return;
    await this.secrets.delete(row.token_secret_key);
    this.db.transaction(()=>{this.db.run("DELETE FROM connection_capabilities WHERE connection_id=?",[id]);this.db.run("DELETE FROM connections WHERE id=?",[id]);});
  }

  async setRequestedCapabilities(id:string,capabilities:ConnectionCapability[]) {
    const existing=this.get(id);if(!existing)throw new Error("Conexão não encontrada.");
    const desired=uniqueCapabilities(capabilities);if(!desired.length)throw new Error("Selecione ao menos uma capacidade.");
    const additions=desired.filter(capability=>!existing.capabilities.includes(capability));
    if(!additions.length){
      const nextOperational=existing.capabilities.filter(capability=>desired.includes(capability));
      const grants=(existing.capabilityGrants??[]).filter(grant=>desired.includes(grant.capability));
      const status:ConnectionStatus=nextOperational.length===desired.length?"connected":nextOperational.length?"degraded":"reauthorization-required";
      this.db.transaction(()=>{
        this.db.run("UPDATE connections SET requested_capabilities_json=?,capabilities_json=?,status=?,updated_at=? WHERE id=?",[JSON.stringify(desired),JSON.stringify(nextOperational),status,new Date().toISOString(),id]);
        this.db.run(`DELETE FROM connection_capabilities WHERE connection_id=? AND capability NOT IN (${desired.map(()=>"?").join(",")})`,[id,...desired]);
      });
      return this.get(id)!;
    }

    let reauthorized:ConnectionAccount;
    try { reauthorized=await this.connect(existing.provider,desired); }
    catch(error) {
      const reason=error instanceof Error?error.message:String(error);
      throw new Error(`A reautorização não substituiu a conexão atual: ${reason}`);
    }
    if(!reauthorized.capabilities.length){
      const reason=reauthorized.lastError??reauthorized.reauthorizationReason??"Nenhuma das permissões solicitadas ficou operacional.";
      await this.disconnect(reauthorized.id);
      throw new Error(`A reautorização não substituiu a conexão atual: ${reason}`);
    }
    await this.replaceConnectionFromTemporary(id,reauthorized.id);
    return this.get(id)!;
  }

  async addCapabilities(id:string,capabilities:ConnectionCapability[]) {
    const existing=this.get(id);if(!existing)throw new Error("Conexão não encontrada.");
    return this.setRequestedCapabilities(id,[...new Set([...(existing.requestedCapabilities??existing.capabilities),...capabilities])]);
  }

  async test(id:string) {
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);if(!row)throw new Error("Conexão não encontrada.");
    try{
      if(!row.token_secret_key)throw new Error("A conexão não possui credencial persistida.");
      const token=await this.tokenManager.accessToken(row.provider,row.token_secret_key);
      const profile=await getProfile(row.provider,token.accessToken);
      if(row.provider==="google"){
        const requested=safeCapabilities(row.requested_capabilities_json??row.capabilities_json);
        const configured=this.resolveConfiguration().googleClientId;
        const snapshot=await inspectGoogleGrant({accessToken:token.accessToken,tokenScope:token.reportedScope,configuredClientId:configured,persistedScopes:safeStringArray(row.granted_scopes_json)});
        const validation=await validateGoogleCapabilities({accessToken:token.accessToken,requestedCapabilities:requested,grantedScopes:snapshot.scopes,scopeSource:snapshot.scopeSource});
        validation.grants.forEach(grant=>this.logOAuthDiagnostic(safeGrantForLog(grant)));
        this.persistGoogleValidation(row,snapshot,validation.grants,validation.operationalCapabilities,profile);
      }else{
        const now=new Date().toISOString();
        this.db.run("UPDATE connections SET account_email=COALESCE(?,account_email),display_name=COALESCE(?,display_name),provider_account_id=COALESCE(?,provider_account_id),last_validated_at=?,last_health_check_at=?,status='connected',last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[profile.email??null,profile.name??null,profile.id??null,now,now,now,id]);
      }
      return this.get(id)!;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      this.db.run("UPDATE connections SET last_error=?,last_health_check_at=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),new Date().toISOString(),id]);
      throw error;
    }
  }

  async diagnostics(id:string):Promise<ConnectionDiagnosticSnapshot> {
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);if(!row)throw new Error("Conexão não encontrada.");
    const state=row.token_secret_key?await this.tokenManager.state(row.token_secret_key):{exists:false,hasAccessToken:false,hasRefreshToken:false,expired:true};
    const configured=row.provider==="google"?this.resolveConfiguration().googleClientId:this.resolveConfiguration().microsoftClientId;
    return{
      provider:row.provider,status:row.status,accountEmail:row.account_email,oauthClientId:row.oauth_client_id,configuredClientId:configured,
      clientMatches:row.oauth_client_id&&configured?row.oauth_client_id===configured:undefined,tokenPresent:state.exists&&state.hasAccessToken,refreshTokenPresent:state.hasRefreshToken,
      requestedCapabilities:safeCapabilities(row.requested_capabilities_json??row.capabilities_json),grantedScopes:safeStringArray(row.granted_scopes_json),scopeSource:row.scope_source,
      capabilities:this.readCapabilityGrants(id),lastValidatedAt:row.last_validated_at,lastRefreshAt:row.last_refresh_at,lastHealthCheckAt:row.last_health_check_at
    };
  }

  async accessToken(id:string,capability:ConnectionCapability) {
    this.assertEnabled();
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);
    if(!row)throw new Error("A conexão não foi encontrada.");
    if(row.status==="expired"||row.status==="reauthorization-required")throw new Error(row.reauthorization_reason||row.last_error||"A conexão precisa ser autorizada novamente.");
    if(!safeCapabilities(row.capabilities_json).includes(capability))throw new Error(`A conta conectada não possui a permissão operacional necessária: ${capability}.`);
    if(!row.token_secret_key)throw new Error("A credencial segura não está disponível. Reconecte a conta.");
    try{
      const token=await this.tokenManager.accessToken(row.provider,row.token_secret_key);
      if(token.refreshed)await this.recordRefresh(row,token.accessToken,token.expiresAt,token.reportedScope);
      return token.accessToken;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(this.get(id)?.status==="reauthorization-required"||/client secret|refresh_token|refresh token|reconecte|revogad/i.test(message))this.markReauthorizationRequired(id,message);else this.db.run("UPDATE connections SET last_error=?,updated_at=? WHERE id=?",[message,new Date().toISOString(),id]);
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
      await this.recordRefresh(row,token.accessToken,token.expiresAt,token.reportedScope);
      return token;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(this.get(id)?.status==="reauthorization-required"||/client secret|refresh_token|refresh token|reconecte|revogad/i.test(message))this.markReauthorizationRequired(id,message);else this.db.run("UPDATE connections SET status=?,last_error=?,updated_at=? WHERE id=?",[this.statusFromPersistedGrants(row),message,new Date().toISOString(),id]);
      throw error;
    }
  }

  markReauthorizationRequired(id:string,reason:string) {
    this.db.run("UPDATE connections SET status='reauthorization-required',last_error=?,reauthorization_reason=?,updated_at=? WHERE id=?",[reason,reason,new Date().toISOString(),id]);
  }

  markCapabilityUnavailable(id:string,capability:ConnectionCapability,reason:string,httpStatus?:number,providerReason?:string) {
    const existing=this.db.get<CapabilityGrantRow>("SELECT * FROM connection_capabilities WHERE connection_id=? AND capability=?",[id,capability]);
    if(existing){
      this.db.run("UPDATE connection_capabilities SET validated=0,status='unavailable',provider_reason=?,provider_message=?,http_status=?,last_validated_at=? WHERE connection_id=? AND capability=?",[providerReason??"runtime_api_failure",reason,httpStatus??null,new Date().toISOString(),id,capability]);
      this.recomputeConnectionStatus(id);
    }
  }

  private resolveConfiguration():OAuthConfiguration {
    const saved=this.oauthConfiguration?.(),env=environment();
    return{googleClientId:saved?.googleClientId.trim()||env.googleClientId,microsoftClientId:saved?.microsoftClientId.trim()||env.microsoftClientId,microsoftTenant:saved?.microsoftTenant.trim()||env.microsoftTenant};
  }
  private assertEnabled(){if(!this.connectionsEnabled())throw new Error("Conexões externas ficam desativadas no modo privado.");}

  private async recordRefresh(row:ConnectionRow,accessToken:string,expiresAt?:string,reportedScope?:string) {
    if(row.provider==="google"){
      const configured=this.resolveConfiguration().googleClientId;
      const requested=safeCapabilities(row.requested_capabilities_json??row.capabilities_json);
      const snapshot=await inspectGoogleGrant({accessToken,tokenScope:reportedScope,configuredClientId:configured,persistedScopes:safeStringArray(row.granted_scopes_json)});
      const validation=await validateGoogleCapabilities({accessToken,requestedCapabilities:requested,grantedScopes:snapshot.scopes,scopeSource:snapshot.scopeSource});
      validation.grants.forEach(grant=>this.logOAuthDiagnostic(safeGrantForLog(grant)));
      this.persistGoogleValidation(row,snapshot,validation.grants,validation.operationalCapabilities,undefined,expiresAt,true);
      return;
    }
    const now=new Date().toISOString();
    this.db.run("UPDATE connections SET status='connected',last_refresh_at=?,token_expires_at=?,last_error=NULL,reauthorization_reason=NULL,updated_at=? WHERE id=?",[now,expiresAt??null,now,row.id]);
  }

  private persistGoogleValidation(row:ConnectionRow,snapshot:GoogleGrantSnapshot,grants:CapabilityGrant[],operationalCapabilities:ConnectionCapability[],profile?:ProviderProfile,expiresAt?:string,isRefresh=false) {
    const requested=safeCapabilities(row.requested_capabilities_json??row.capabilities_json);
    const status=connectionStatusFromGrants(requested,grants),lastError=summarizeGrantFailures(grants),now=new Date().toISOString();
    this.db.transaction(()=>{
      this.db.run(
        `UPDATE connections SET account_email=COALESCE(?,account_email),display_name=COALESCE(?,display_name),provider_account_id=COALESCE(?,provider_account_id),capabilities_json=?,granted_scopes_json=?,scope_source=?,oauth_client_id=COALESCE(?,oauth_client_id),status=?,last_error=?,reauthorization_reason=?,last_validated_at=?,last_health_check_at=?,last_refresh_at=CASE WHEN ?=1 THEN ? ELSE last_refresh_at END,token_expires_at=COALESCE(?,token_expires_at),updated_at=? WHERE id=?`,
        [profile?.email??null,profile?.name??null,profile?.id??null,JSON.stringify(operationalCapabilities),JSON.stringify(snapshot.scopes),snapshot.scopeSource,snapshot.clientId??null,status,lastError??null,status==="reauthorization-required"?lastError??"A autorização precisa ser refeita.":null,now,now,isRefresh?1:0,now,expiresAt??null,now,row.id]
      );
      this.replaceCapabilityGrants(row.id,grants);
    });
  }

  private replaceCapabilityGrants(connectionId:string,grants:CapabilityGrant[]) {
    this.db.run("DELETE FROM connection_capabilities WHERE connection_id=?",[connectionId]);
    for(const grant of grants)this.db.run(
      "INSERT INTO connection_capabilities(connection_id,capability,requested,expected_scopes_json,granted,granted_scope,validated,status,validation_source,provider_reason,provider_message,http_status,last_validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [connectionId,grant.capability,grant.requested?1:0,JSON.stringify(grant.expectedScopes),grant.granted?1:0,grant.grantedByScope??null,grant.validated?1:0,grant.status,grant.validationSource??null,grant.providerReason??null,grant.providerMessage??null,grant.httpStatus??null,grant.lastValidatedAt??null]
    );
  }

  private readCapabilityGrants(connectionId:string):CapabilityGrant[] {
    return this.db.all<CapabilityGrantRow>("SELECT * FROM connection_capabilities WHERE connection_id=? ORDER BY capability",[connectionId]).map(row=>({
      capability:row.capability,requested:Boolean(row.requested),expectedScopes:safeStringArray(row.expected_scopes_json),granted:Boolean(row.granted),grantedByScope:row.granted_scope,
      validated:Boolean(row.validated),status:row.status,validationSource:row.validation_source,providerReason:row.provider_reason,providerMessage:row.provider_message,httpStatus:row.http_status,lastValidatedAt:row.last_validated_at
    }));
  }

  private statusFromPersistedGrants(row:ConnectionRow):ConnectionStatus {
    if(row.provider!=="google")return"connected";
    const requested=safeCapabilities(row.requested_capabilities_json??row.capabilities_json),grants=this.readCapabilityGrants(row.id);
    if(!grants.length)return row.status==="degraded"?"degraded":row.status==="connected"?"connected":"reauthorization-required";
    return connectionStatusFromGrants(requested,grants);
  }

  private recomputeConnectionStatus(id:string) {
    const row=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[id]);if(!row)return;
    const grants=this.readCapabilityGrants(id),requested=safeCapabilities(row.requested_capabilities_json??row.capabilities_json),operational=grants.filter(isCapabilityOperational).map(grant=>grant.capability);
    const status=connectionStatusFromGrants(requested,grants),lastError=summarizeGrantFailures(grants);
    this.db.run("UPDATE connections SET capabilities_json=?,status=?,last_error=?,reauthorization_reason=?,updated_at=? WHERE id=?",[JSON.stringify(operational),status,lastError??null,status==="reauthorization-required"?lastError??"A autorização precisa ser refeita.":null,new Date().toISOString(),id]);
  }

  private async replaceConnectionFromTemporary(targetId:string,tempId:string) {
    const previous=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[targetId]);
    const next=this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?",[tempId]);
    if(!previous||!next)throw new Error("Não foi possível concluir a troca segura da conexão OAuth.");
    const nextGrants=this.readCapabilityGrants(tempId),now=new Date().toISOString();
    this.db.transaction(()=>{
      this.db.run(
        "UPDATE connections SET account_email=?,display_name=?,capabilities_json=?,token_secret_key=?,status=?,last_error=?,last_connected_at=?,last_validated_at=?,last_refresh_at=?,token_expires_at=?,provider_account_id=?,requested_capabilities_json=?,granted_scopes_json=?,last_health_check_at=?,reauthorization_reason=?,oauth_client_id=?,scope_source=?,updated_at=? WHERE id=?",
        [next.account_email??null,next.display_name??null,next.capabilities_json,next.token_secret_key,next.status,next.last_error??null,next.last_connected_at??now,next.last_validated_at??now,next.last_refresh_at??null,next.token_expires_at??null,next.provider_account_id??null,next.requested_capabilities_json??"[]",next.granted_scopes_json??"[]",next.last_health_check_at??now,next.reauthorization_reason??null,next.oauth_client_id??null,next.scope_source??null,now,targetId]
      );
      this.db.run("DELETE FROM connection_capabilities WHERE connection_id=?",[targetId]);
      for(const grant of nextGrants)this.db.run("INSERT INTO connection_capabilities(connection_id,capability,requested,expected_scopes_json,granted,granted_scope,validated,status,validation_source,provider_reason,provider_message,http_status,last_validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[targetId,grant.capability,grant.requested?1:0,JSON.stringify(grant.expectedScopes),grant.granted?1:0,grant.grantedByScope??null,grant.validated?1:0,grant.status,grant.validationSource??null,grant.providerReason??null,grant.providerMessage??null,grant.httpStatus??null,grant.lastValidatedAt??null]);
      this.db.run("DELETE FROM connection_capabilities WHERE connection_id=?",[tempId]);
      this.db.run("DELETE FROM connections WHERE id=?",[tempId]);
    });
    if(previous.token_secret_key&&previous.token_secret_key!==next.token_secret_key)await this.secrets.delete(previous.token_secret_key);
  }

  private ensureMetadataColumns() {
    const columns=new Set(this.db.all<{name:string}>("PRAGMA table_info(connections)").map(column=>String(column.name)));
    const additions:[string,string][]=[
      ["requested_capabilities_json","TEXT"],["granted_scopes_json","TEXT"],["last_health_check_at","TEXT"],["reauthorization_reason","TEXT"],["oauth_client_id","TEXT"],["scope_source","TEXT"]
    ];
    for(const[name,type]of additions)if(!columns.has(name))this.db.run(`ALTER TABLE connections ADD COLUMN ${name} ${type}`);
    this.db.run("CREATE TABLE IF NOT EXISTS connection_capabilities(connection_id TEXT NOT NULL,capability TEXT NOT NULL,requested INTEGER NOT NULL DEFAULT 0,expected_scopes_json TEXT NOT NULL DEFAULT '[]',granted INTEGER NOT NULL DEFAULT 0,granted_scope TEXT,validated INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,validation_source TEXT,provider_reason TEXT,provider_message TEXT,http_status INTEGER,last_validated_at TEXT,PRIMARY KEY(connection_id,capability))");
  }

  private toAccount(row:ConnectionRow):ConnectionAccount {
    const capabilities=safeCapabilities(row.capabilities_json);
    return{id:row.id,provider:row.provider,accountEmail:row.account_email,displayName:row.display_name,capabilities,requestedCapabilities:safeCapabilities(row.requested_capabilities_json??row.capabilities_json),grantedScopes:safeStringArray(row.granted_scopes_json),capabilityGrants:this.readCapabilityGrants(row.id),oauthClientId:row.oauth_client_id,scopeSource:row.scope_source,status:row.status,lastError:row.last_error,updatedAt:row.updated_at,lastConnectedAt:row.last_connected_at,lastValidatedAt:row.last_validated_at,lastRefreshAt:row.last_refresh_at,tokenExpiresAt:row.token_expires_at,providerAccountId:row.provider_account_id,lastHealthCheckAt:row.last_health_check_at,reauthorizationReason:row.reauthorization_reason};
  }
}

const microsoftScopes=(items:ConnectionCapability[])=>[...new Set(["openid","profile","offline_access","User.Read",...items.map(item=>MICROSOFT_SCOPE_BY_CAPABILITY[item])])];
function microsoftScopeAllows(scopes:string[],capability:ConnectionCapability){const set=new Set(scopes),wanted=MICROSOFT_SCOPE_BY_CAPABILITY[capability];if(set.has(wanted))return true;if(capability==="email.read"&&set.has("Mail.ReadWrite"))return true;if(capability==="calendar.read"&&set.has("Calendars.ReadWrite"))return true;return false;}

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

function uniqueCapabilities(items:ConnectionCapability[]){return[...new Set(items)];}
async function safeJson(response:Response):Promise<Record<string,unknown>>{try{return await response.json() as Record<string,unknown>;}catch{return{};}}
function firstString(...values:unknown[]){return values.find(value=>typeof value==="string"&&value.length>0) as string|undefined;}
function providerLabel(provider:ConnectionProvider){return provider==="google"?"Google":"Microsoft";}
function safeCapabilities(value:string){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>["email.read","email.send","email.modify","calendar.read","calendar.write"].includes(item)) as ConnectionCapability[]:[];}catch{return[];}}
function safeStringArray(value?:string){if(!value)return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter(item=>typeof item==="string") as string[]:[];}catch{return[];}}
function oauthStageError(provider:ConnectionProvider,stage:string,error:unknown){const message=error instanceof Error?error.message:String(error);if(error instanceof DOMException&&(error.name==="TimeoutError"||error.name==="AbortError"))return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: a operação excedeu o tempo limite.`);return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: ${message}`);}
function oauthErrorMessage(provider:ConnectionProvider,code?:string|null,description?:string|null){const normalizedCode=(code??"").toLowerCase(),value=`${code??""} ${description??""}`.toLowerCase(),providerName=providerLabel(provider);if(normalizedCode==="admin_consent_required"||value.includes("admin consent"))return"Sua organização exige aprovação do administrador para estas permissões.";if(value.includes("redirect_uri_mismatch")||value.includes("aadsts50011"))return"O callback OAuth não foi aceito. Use uma credencial de aplicativo desktop e permita o redirect de loopback http://127.0.0.1 no provedor.";if(normalizedCode==="invalid_client"||value.includes("client_secret is missing"))return`${providerName} recusou as credenciais OAuth. Confirme Client ID e Client Secret do mesmo aplicativo desktop.`;if(normalizedCode==="invalid_grant")return`${providerName} recusou o código de autorização. Tente conectar novamente; se persistir, revogue o acesso anterior e autorize de novo.`;if(value.includes("invalid_scope"))return"Uma ou mais permissões solicitadas não estão configuradas ou aprovadas no provedor.";if(value.includes("access_denied"))return provider==="google"?"O acesso foi recusado. Verifique a tela de consentimento, os usuários de teste e as permissões Google.":"O acesso foi recusado. Verifique o consentimento e as permissões delegadas no Microsoft Entra.";const detail=description?.trim();if(detail)return`${providerName} recusou a autorização: ${detail.slice(0,400)}`;return"A autorização foi recusada ou não retornou um código válido.";}
function defaultOAuthDiagnosticLogger(diagnostic:CapabilityGrant){console.info("[oauth-google-grant]",JSON.stringify(diagnostic));}
