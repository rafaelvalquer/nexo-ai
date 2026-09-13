import type { ConnectionCapability } from "@nexo/shared";
import type { ConnectionService } from "../connections/service.js";

const GOOGLE_API_TIMEOUT_MS = 30_000;
export type GoogleApiErrorKind = "unauthorized"|"insufficient_permission"|"api_disabled"|"rate_limited"|"transient"|"provider_error";

export class GoogleApiError extends Error {
  constructor(
    message:string,
    readonly httpStatus:number,
    readonly providerCode?:string,
    readonly reason?:string,
    readonly retryable=false,
    readonly kind:GoogleApiErrorKind="provider_error"
  ) { super(message); this.name="GoogleApiError"; }

  static async fromResponse(response:Response) {
    const body=await safeJson(response.clone());
    const error=(body.error && typeof body.error === "object") ? body.error as Record<string,unknown> : body;
    const message=typeof error.message === "string" ? error.message : typeof body.error_description === "string" ? body.error_description : `HTTP ${response.status}`;
    const providerCode=typeof error.status === "string" ? error.status : typeof body.error === "string" ? body.error : undefined;
    const errors=Array.isArray(error.errors)?error.errors as Array<Record<string,unknown>>:[];
    const reason=errors.find(item=>typeof item.reason === "string")?.reason as string|undefined;
    const lower=`${message} ${providerCode??""} ${reason??""}`.toLowerCase();
    if(response.status===401) return new GoogleApiError("A sessão do Google expirou ou foi revogada. O Nexo tentou renovar a credencial automaticamente.",401,providerCode,reason,false,"unauthorized");
    if(response.status===403 && /(accessnotconfigured|api.*disabled|has not been used|serviceusage)/.test(lower)) return new GoogleApiError("A API Google necessária não está habilitada para o projeto OAuth configurado.",403,providerCode,reason,false,"api_disabled");
    if(response.status===403 && /(insufficient|scope|permission)/.test(lower)) return new GoogleApiError("O Google recusou esta operação por permissão insuficiente. A capability afetada foi marcada para nova validação.",403,providerCode,reason,false,"insufficient_permission");
    if(response.status===429) return new GoogleApiError("O Google limitou temporariamente as consultas. Tente novamente em alguns instantes.",429,providerCode,reason,true,"rate_limited");
    if(response.status>=500) return new GoogleApiError("O serviço Google está temporariamente indisponível. A conexão foi mantida.",response.status,providerCode,reason,true,"transient");
    return new GoogleApiError(`O Google recusou a operação: ${message}`,response.status,providerCode,reason,response.status>=500,"provider_error");
  }
}

export class GoogleApiClient {
  constructor(private readonly connections:ConnectionService) {}

  async request(
    connectionId:string,
    capability:ConnectionCapability,
    url:string,
    init:RequestInit={},
    signal?:AbortSignal
  ):Promise<Response> {
    let forcedRefresh=false;
    let transientAttempt=0;
    const retryTransient=isIdempotent(init.method);
    while(true) {
      const token=forcedRefresh
        ? (await this.connections.forceRefreshToken(connectionId)).accessToken
        : await this.connections.accessToken(connectionId,capability);
      const requestSignal=combineSignals(signal,AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS));
      let response:Response;
      try {
        response=await fetch(url,{...init,headers:{...(init.headers??{}),Authorization:`Bearer ${token}`},signal:requestSignal});
      } catch(error) {
        if(signal?.aborted) throw signal.reason??new DOMException("Cancelada pelo usuário.","AbortError");
        if(retryTransient&&transientAttempt<2) { await delay(500*(2**transientAttempt),signal); transientAttempt++; continue; }
        throw error;
      }
      if(response.ok) return response;
      if(response.status===401 && !forcedRefresh) { forcedRefresh=true; continue; }
      if(retryTransient&&(response.status===429||response.status>=500)&&transientAttempt<2) { await delay(500*(2**transientAttempt),signal); transientAttempt++; continue; }
      const error=await GoogleApiError.fromResponse(response);
      if(error.kind==="unauthorized") this.connections.markReauthorizationRequired(connectionId,error.message);
      else if(error.kind==="insufficient_permission"||error.kind==="api_disabled") this.connections.markCapabilityUnavailable(connectionId,capability,error.message,error.httpStatus,error.reason??error.kind);
      throw error;
    }
  }

  async json<T>(connectionId:string,capability:ConnectionCapability,url:string,init:RequestInit={},signal?:AbortSignal):Promise<T> {
    const response=await this.request(connectionId,capability,url,init,signal);
    return response.json() as Promise<T>;
  }
}

function isIdempotent(method?:string){const normalized=(method??"GET").toUpperCase();return normalized==="GET"||normalized==="HEAD"||normalized==="OPTIONS";}
function combineSignals(a?:AbortSignal,b?:AbortSignal) {
  const values=[a,b].filter(Boolean) as AbortSignal[];
  if(values.length===0) return undefined;
  if(values.length===1) return values[0];
  return AbortSignal.any(values);
}
async function safeJson(response:Response):Promise<Record<string,unknown>> { try{return await response.json() as Record<string,unknown>;}catch{return{};} }
async function delay(ms:number,signal?:AbortSignal){if(signal?.aborted)throw signal.reason??new DOMException("Cancelada pelo usuário.","AbortError");await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(signal.reason??new DOMException("Cancelada pelo usuário.","AbortError"));},{once:true});});}
