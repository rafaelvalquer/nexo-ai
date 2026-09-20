import type {ToolRegistry} from "../../tools/registry.js";
import type {CanonicalWebIntent} from "./types.js";
export type WebIntentMapResult={type:"tool";tool:string;input:Record<string,unknown>;explanation:string}|{type:"unknown"};
export class WebIntentMapper{
  constructor(private readonly registry:ToolRegistry){}
  map(intent:CanonicalWebIntent,originalText:string):WebIntentMapResult{
    if(intent.operation==="research"){
      if(!this.registry.get("web_research"))return{type:"unknown"};
      return{type:"tool",tool:"web_research",input:{query:intent.entities.query??intent.entities.topic??originalText,...(intent.entities.sourceName?{sourceName:intent.entities.sourceName}:{}),...(intent.entities.domain?{domain:intent.entities.domain}:{}),...(intent.entities.url?{url:intent.entities.url}:{}),maxSources:5},explanation:intent.entities.sourceName?"Pesquisando no "+intent.entities.sourceName+" e lendo as principais fontes…":"Pesquisando na web e lendo as principais fontes…"};
    }
    if(intent.operation==="fetch"&&intent.entities.url&&this.registry.get("web_fetch"))return{type:"tool",tool:"web_fetch",input:{url:intent.entities.url,maxChars:16000},explanation:"Lendo a página sem abrir navegador…"};
    if(intent.operation==="interact"&&this.registry.get("browser_agent_run"))return{type:"tool",tool:"browser_agent_run",input:{request:originalText,mode:/\b(minha conta|meu perfil|login|autenticad[oa])\b/i.test(originalText)?"personal":"research"},explanation:"Executando a interação solicitada no navegador…"};
    if(intent.operation==="navigate"){const url=intent.entities.url??(intent.entities.domain?"https://"+intent.entities.domain.replace(/^https?:\/\//,""):undefined);if(url&&this.registry.get("browser_open"))return{type:"tool",tool:"browser_open",input:{url},explanation:"Abrindo "+url+"…"};}
    if(intent.operation==="search"&&this.registry.get("web_search"))return{type:"tool",tool:"web_search",input:{query:intent.entities.query??originalText,maxResults:6},explanation:"Pesquisando na web…"};
    return{type:"unknown"};
  }
}
