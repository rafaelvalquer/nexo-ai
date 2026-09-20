import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type {WebDocument,WebHtmlDocument,WebSearchResult} from "./types.js";

const MAX_HTML_BYTES=2_000_000;
export const MAX_TEXT_CHARS=30_000;
const MAX_REDIRECTS=4;
export const DEFAULT_WEB_TIMEOUT_MS=15_000;

export class WebReaderService{
  async search(query:string,maxResults=5,signal?:AbortSignal):Promise<{query:string;results:WebSearchResult[]}>{
    const url=new URL("https://html.duckduckgo.com/html/");url.searchParams.set("q",query);
    const response=await requestText(url,signal,DEFAULT_WEB_TIMEOUT_MS,1_000_000);
    if(response.status<200||response.status>=300)throw new Error(`A pesquisa web respondeu HTTP ${response.status}.`);
    if(!/^text\/html(?:\s*;|$)/i.test(response.headers["content-type"]??""))throw new Error("O provedor de pesquisa não retornou HTML.");
    return{query,results:parseSearchResults(response.body,url.toString()).slice(0,Math.min(Math.max(maxResults,1),10))};
  }

  async fetch(url:string,maxChars=12_000,signal?:AbortSignal):Promise<WebDocument>{
    const response=await requestText(new URL(url),signal,DEFAULT_WEB_TIMEOUT_MS,MAX_HTML_BYTES);
    if(response.status<200||response.status>=300)throw new Error(`A página respondeu HTTP ${response.status}.`);
    const contentType=response.headers["content-type"]??"";
    if(!/^(text\/html|application\/xhtml\+xml|text\/plain)(?:\s*;|$)/i.test(contentType))throw new Error("A URL não retornou HTML ou texto simples.");
    return extractWebDocument(response.body,new URL(response.finalUrl).toString(),maxChars);
  }

  async fetchHtml(url:string,signal?:AbortSignal):Promise<WebHtmlDocument>{
    const response=await requestText(new URL(url),signal,DEFAULT_WEB_TIMEOUT_MS,MAX_HTML_BYTES);
    if(response.status<200||response.status>=300)throw new Error(`A página respondeu HTTP ${response.status}.`);
    const contentType=response.headers["content-type"]??"";
    if(!/^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType))throw new Error("A URL não retornou HTML.");
    const finalUrl=new URL(response.finalUrl).toString();
    return{url:finalUrl,title:pageTitle(response.body),html:response.body};
  }
}

export function extractWebDocument(html:string,url?:string,maxChars=12_000):WebDocument{
  const title=pageTitle(html);
  const main=html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1]??html;
  const text=decodeHtml(main.replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style|svg|noscript|header|nav|footer|aside|form|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi,"\n").replace(/<[^>]+>/g," ")).replace(/[\t\f\v ]+/g," ").replace(/\s+([.,!?;:])/g,"$1").replace(/ *\n+ */g,"\n").replace(/\n{3,}/g,"\n\n").trim().slice(0,Math.min(Math.max(maxChars,500),MAX_TEXT_CHARS));
  return{url:url??"",title,text};
}

export function parseSearchResults(html:string,baseUrl:string):WebSearchResult[]{
  const results:WebSearchResult[]=[];
  const pattern=/<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for(const match of html.matchAll(pattern)){
    const attrs=match[1]??"",rawHref=attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];if(!rawHref)continue;
    const href=decodeHtml(rawHref);let target:string;
    try{const resolved=new URL(href,baseUrl),redirect=resolved.searchParams.get("uddg");target=redirect?new URL(redirect).toString():resolved.toString();if(!["http:","https:"].includes(new URL(target).protocol))continue;}catch{continue;}
    const title=decodeHtml((match[2]??"").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();if(!title)continue;
    const end=match.index!+match[0].length,tail=html.slice(end,end+1200),snippetRaw=tail.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]??"";
    const snippet=decodeHtml(snippetRaw.replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim().slice(0,500);
    if(!results.some(item=>item.url===target))results.push({title,url:target,snippet});
  }
  return results;
}

export function isPublicAddress(address:string):boolean{
  const family=net.isIP(address);if(family===4){const octets=address.split(".").map(Number);if(octets.length!==4)return false;const[a,b,c]=octets;
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===192&&b===2||a===192&&b===88&&c===99||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(family===6){const value=address.toLowerCase().split("%")[0];if(value.startsWith("::ffff:")){const mapped=value.slice(7);return net.isIPv4(mapped)?isPublicAddress(mapped):false;}const groups=value.split(":"),first=parseInt(groups[0]||"0",16),second=parseInt(groups[1]||"0",16);return first>=0x2000&&first<=0x3fff&&!value.startsWith("2001:db8:")&&!(first===0x2001&&second<0x0200)&&first!==0x2002;}
  return false;
}

export function pageTitle(html:string){return decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]??html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']*)/i)?.[1]??"").trim().replace(/\s+/g," ").slice(0,300);}

async function requestText(start:URL,signal:AbortSignal|undefined,timeoutMs:number,maxBytes:number):Promise<{status:number;headers:http.IncomingHttpHeaders;body:string;finalUrl:string}>{
  let url=start;
  for(let redirectCount=0;redirectCount<=MAX_REDIRECTS;redirectCount++){
    validateUrl(url);
    const response=await requestWithRetry(url,signal,timeoutMs,maxBytes);
    if(response.status>=300&&response.status<400&&response.headers.location){if(redirectCount===MAX_REDIRECTS)throw new Error("A página excedeu o limite de redirecionamentos.");url=new URL(response.headers.location,url);continue;}
    return{...response,finalUrl:url.toString()};
  }
  throw new Error("Não foi possível seguir o redirecionamento web.");
}

async function requestWithRetry(url:URL,signal:AbortSignal|undefined,timeoutMs:number,maxBytes:number){
  for(let attempt=0;attempt<3;attempt++){
    try{const response=await requestOnce(url,signal,timeoutMs,maxBytes);if(![429,502,503,504].includes(response.status)||attempt===2)return response;}
    catch(error){if(signal?.aborted||attempt===2||!isTransientNetworkError(error))throw error;}
    await abortableDelay(150*(2**attempt),signal);
  }
  throw new Error("A requisição web falhou após as tentativas permitidas.");
}
function isTransientNetworkError(error:unknown){const code=error&&typeof error==="object"?(error as NodeJS.ErrnoException).code:"";return["ECONNRESET","ECONNREFUSED","ETIMEDOUT","EAI_AGAIN","EPIPE"].includes(String(code))||/timeout|temporar/i.test(error instanceof Error?error.message:String(error));}
function abortableDelay(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal?.aborted){reject(signal.reason??new Error("Operação cancelada."));return;}const finish=()=>{signal?.removeEventListener("abort",abort);resolve();},timer=setTimeout(finish,ms),abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(signal?.reason??new Error("Operação cancelada."));};signal?.addEventListener("abort",abort,{once:true});});}

function validateUrl(url:URL){
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("Apenas URLs HTTP/HTTPS públicas são aceitas.");
  if(url.port&&url.port!=="80"&&url.port!=="443")throw new Error("A URL usa uma porta não permitida.");
  const hostname=url.hostname.replace(/^\[|\]$/g,"").toLowerCase();
  if(!hostname||hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local")||hostname.endsWith(".internal")||hostname.endsWith(".test"))throw new Error("Endereço local não permitido para acesso web.");
  if(net.isIP(hostname)&&!isPublicAddress(hostname))throw new Error("Endereço IP privado ou reservado não permitido.");
}

function requestOnce(url:URL,signal:AbortSignal|undefined,timeoutMs:number,maxBytes:number):Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason??new Error("Operação cancelada."));return;}
    const transport=url.protocol==="https:"?https:http;
    const request=transport.request(url,{method:"GET",headers:{"accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1","accept-language":"pt-BR,pt;q=0.9,en;q=0.7","accept-encoding":"identity","user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 NexoAI-WebReader/1.2"},lookup:((hostname:string,options:any,callback:any)=>{
      dns.lookup(hostname,{all:true,verbatim:true},(error,records)=>{if(error)return callback(error);if(!records.length||records.some(record=>!isPublicAddress(record.address)))return callback(new Error("O domínio resolve para um endereço privado ou reservado."));callback(null,options?.all?records:records[0].address,records[0].family);});
    }) as any});
    const finishError=(error:Error)=>{request.destroy();reject(error);};
    const onAbort=()=>finishError(new Error("Operação web cancelada."));
    signal?.addEventListener("abort",onAbort,{once:true});
    request.setTimeout(timeoutMs,()=>finishError(new Error(`Tempo limite da requisição web (${timeoutMs} ms).`)));
    request.on("error",error=>{signal?.removeEventListener("abort",onAbort);reject(error);});
    request.on("response",response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on("data",(chunk:Buffer|string)=>{const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;if(bytes>maxBytes){response.destroy(new Error("A resposta web excede o limite permitido."));return;}chunks.push(buffer);});
      response.on("end",()=>{signal?.removeEventListener("abort",onAbort);resolve({status:response.statusCode??0,headers:response.headers,body:Buffer.concat(chunks).toString("utf8")});});
      response.on("error",error=>{signal?.removeEventListener("abort",onAbort);reject(error);});
    });
    request.end();
  });
}

function decodeHtml(value:string){return value.replace(/&#(x[\da-f]+|\d+);?/gi,(_match,code:string)=>{const number=code[0]?.toLowerCase()==="x"?parseInt(code.slice(1),16):parseInt(code,10);return Number.isFinite(number)?String.fromCodePoint(Math.min(number,0x10ffff)):"";}).replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");}
