import type {LLMProvider} from "../../llm/provider.js";
import type {LocalMetricsService} from "../../observability/metrics.js";
import {stripCodeFence} from "../../security/prompt.js";
import {webIntentJsonSchema,parseWebIntent} from "./schema.js";
import {WEB_INTENT_SYSTEM_PROMPT,webIntentPrompt} from "./prompt.js";
import {hasInformationGoal,hasInteractionGoal,requiresPersonalSession} from "./goal-conflict-guard.js";
import type {CanonicalWebIntent,WebIntentResolution} from "./types.js";

export class WebIntentResolver{
  private last?:CanonicalWebIntent;
  constructor(private readonly llm?:LLMProvider,private readonly metrics?:LocalMetricsService){}
  diagnostics(){return this.last?structuredClone(this.last):undefined;}
  async resolve(text:string,signal?:AbortSignal):Promise<WebIntentResolution>{
    this.metrics?.record("web.intent.invoked",1);
    const deterministic=deterministicWebIntent(text);
    if(deterministic){this.record(deterministic);return{status:"resolved",intent:deterministic};}
    if(!mayBeWebRequest(text)||!this.llm)return{status:"unknown",reason:"not_web_like"};
    try{
      let intent:CanonicalWebIntent;
      if(this.llm.planStructured){
        intent=await this.llm.planStructured({messages:[{role:"system",content:WEB_INTENT_SYSTEM_PROMPT},{role:"user",content:webIntentPrompt(text)}],schema:webIntentJsonSchema,schemaName:"NexoWebIntentV1",parse:parseWebIntent},signal);
      }else{
        const raw=await this.llm.plan([{role:"system",content:WEB_INTENT_SYSTEM_PROMPT},{role:"user",content:webIntentPrompt(text)}],signal);
        intent=parseWebIntent(JSON.parse(stripCodeFence(raw)));
      }
      if(intent.operation==="unknown"){this.metrics?.record("web.intent.unknown",1);return{status:"unknown",reason:"model_unknown"};}
      this.record(intent);return{status:"resolved",intent};
    }catch(error){this.metrics?.record("web.intent.unknown",1,{reason:"classifier_error"});return{status:"unknown",reason:error instanceof Error?error.name:"classifier_error"};}
  }
  private record(intent:CanonicalWebIntent){this.last=intent;this.metrics?.record("web.intent."+intent.operation,1);}
}

export function mayBeWebRequest(text:string){
  return /https?:\/\/|\bwww\.|\b(site|internet|web|p[aá]gina|navegador|github|g1|uol|infomoney|techcrunch|cnn|react|microsoft|google|linkedin|instagram|youtube)\b|\.[a-z]{2,}\b/i.test(text)
    || /\b(acesse|acessar|abra|abrir|entre|pesquise|pesquisar|procure|buscar|consulte|not[ií]cias?|manchetes?)\b/i.test(text)&&/\b(no|na|do|da)\b/i.test(text);
}

export function deterministicWebIntent(text:string):CanonicalWebIntent|undefined{
  if(!mayBeWebRequest(text))return undefined;
  const url=explicitUrl(text),domain=explicitDomain(text),sourceName=extractSourceName(text,domain,url);
  const interaction=hasInteractionGoal(text),information=hasInformationGoal(text);
  const navigate=/\b(acesse|acessar|abra|abrir|entre|entrar|navegue)\b/i.test(text);
  const explicitFetch=Boolean(url)&&/\b(leia|ler|resum|explique|extraia|conte[uú]do|analise)\b/i.test(text);
  let operation:CanonicalWebIntent["operation"]="unknown";
  if(interaction||requiresPersonalSession(text))operation="interact";
  else if(explicitFetch)operation="fetch";
  else if(information)operation="research";
  else if(navigate&&(url||domain||sourceName||/\bnavegador\b/i.test(text)))operation="navigate";
  if(operation==="unknown")return undefined;
  const query=operation==="research"?extractResearchQuery(text,sourceName,domain,url):undefined;
  const requestedAction=operation==="interact"?text.trim():undefined;
  return{schemaVersion:1,domain:"web",operation,entities:{...(sourceName?{sourceName}:{}),...(domain?{domain}:{}),...(url?{url}:{}),...(query?{query}:{}),...(requestedAction?{requestedAction}:{})},requiresInformation:operation==="research"||operation==="fetch",requiresInteraction:operation==="interact",confidence:.92,ambiguities:[],missing:operation==="research"&&!query?["query"]:[]};
}

function explicitUrl(text:string){return text.match(/https?:\/\/[^\s<>"\x27)]+/i)?.[0];}
function explicitDomain(text:string){const match=text.match(/\b(?:site\s+)?((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);if(!match)return undefined;return match[1].replace(/^www\./i,"").toLowerCase();}
function extractSourceName(text:string,domain?:string,url?:string){
  if(domain)return domain;if(url){try{return new URL(url).hostname.replace(/^www\./,"");}catch{return undefined;}}
  const patterns=[/\b(?:no|na|do|da)\s+(?:site\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9._-]{1,50})\b/i,/\b(?:acesse|acessar|abra|abrir|entre|entrar|consulte)\s+(?:o\s+site\s+|o\s+|a\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9._-]{1,50})\b/i];
  for(const pattern of patterns){const value=text.match(pattern)?.[1];if(value&&!/^(site|internet|web|navegador)$/i.test(value))return value;}
  return undefined;
}
function extractResearchQuery(text:string,sourceName?:string,domain?:string,url?:string){
  let value=text.trim();
  value=value.replace(/^\s*(?:por favor[, ]*)?(?:acesse|acessar|abra|abrir|entre|entrar|consulte)\s+(?:o\s+site\s+|o\s+|a\s+)?[^,]+?\s+e\s+(?:me\s+)?/i,"");
  value=value.replace(/^\s*(?:pesquise|pesquisar|pesquisa|procure|procurar|busque|buscar|consulte|veja|traga|mostre|diga|informe)\s+/i,"");
  for(const source of [sourceName,domain,url].filter(Boolean) as string[])value=value.replace(new RegExp("(?:\\b(?:no|na|do|da|em|site)\\s+)?"+escapeRegExp(source)+"\\b","ig")," ");
  value=value.replace(/\s+/g," ").replace(/^[,:;-]+|[,:;-]+$/g,"").trim();
  return value||"principais informações";
}
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
