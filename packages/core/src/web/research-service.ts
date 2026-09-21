import {extractArticleCandidates} from "./article-extractor.js";
import {WebReaderService} from "./reader-service.js";
import {WebSourceResolver} from "./source-resolver.js";
import {DuckDuckGoProvider} from "./search/duckduckgo-provider.js";
import {SearchProviderChain} from "./search/search-provider-chain.js";
import type {WebArticleCandidate,WebDiagnostic,WebFailureStage,WebResearchInput,WebResearchResult,WebSearchResult} from "./types.js";

type Metric=(name:string,value:number,tags?:Record<string,string|number|boolean>)=>void;
const MAX_SEARCH_RESULTS=8,MAX_FETCHED_SOURCES=5,MAX_CHARS_PER_SOURCE=5_000,MAX_TOTAL_CHARS=25_000;

export class WebResearchService{
  readonly sourceResolver:WebSourceResolver;
  readonly searchProviders:SearchProviderChain;
  constructor(private readonly reader=new WebReaderService(),private readonly metric?:Metric,searchProviders?:SearchProviderChain){
    this.sourceResolver=new WebSourceResolver(reader);
    this.searchProviders=searchProviders??new SearchProviderChain([new DuckDuckGoProvider(reader)],metric);
  }

  async research(input:WebResearchInput,signal?:AbortSignal):Promise<WebResearchResult>{
    this.metric?.("web.research.started",1);
    const maxSources=Math.min(Math.max(input.maxSources??MAX_FETCHED_SOURCES,1),MAX_FETCHED_SOURCES),query=input.query.trim();
    const diagnostics:WebDiagnostic[]=[],failedSources:WebResearchResult["failedSources"]=[];
    let source:Awaited<ReturnType<WebSourceResolver["resolve"]>>;
    try{source=await this.sourceResolver.resolve(input,signal);}
    catch(error){
      const diagnostic=diagnosticFor(error,"SOURCE_RESOLUTION",undefined,input.url??input.domain??input.sourceName);
      diagnostics.push(diagnostic);failedSources.push({url:diagnostic.url??"source",error:diagnostic.message,stage:diagnostic.stage});
      this.metric?.("web.source.resolve_failed",1);
    }

    const candidates:WebArticleCandidate[]=[];
    let searchResults:WebSearchResult[]=[];
    if(input.url)candidates.push({title:"",url:input.url,searchRank:0});
    else{
      if(source?.url&&isHeadlineRequest(query)){
        const started=Date.now();
        try{
          const home=await this.reader.fetchHtml(source.url,signal);
          const homepage=extractArticleCandidates(home.html,home.url).slice(0,20);
          candidates.push(...homepage);
        }catch(error){
          const diagnostic=diagnosticFor(error,"HOMEPAGE",undefined,source.url);
          diagnostics.push(diagnostic);failedSources.push({url:source.url,error:diagnostic.message,stage:"HOMEPAGE"});
          this.metric?.(failureMetric(diagnostic.stage,error),1);
        }
        this.metric?.("web.research.fetch_duration_ms",Date.now()-started,{phase:"homepage"});
      }

      const searchStarted=Date.now(),searchQuery=source?.domain?`site:${source.domain} ${query}`:query;
      try{
        const search=await this.searchProviders.search(searchQuery,MAX_SEARCH_RESULTS,signal);
        searchResults=source?.domain?search.results.filter(item=>sameDomain(item.url,source!.domain!)):search.results;
        searchResults.forEach((item,index)=>candidates.push({title:item.title,url:item.url,snippet:item.snippet,searchRank:index}));
        if(!searchResults.length)this.metric?.("web.search.zero_results",1,{provider:search.provider});
      }catch(error){
        const diagnostic=diagnosticFor(error,"SEARCH","duckduckgo",searchQuery);
        diagnostics.push(diagnostic);failedSources.push({url:searchQuery,error:diagnostic.message,stage:"SEARCH"});
        this.metric?.("web.search.zero_results",1,{provider:diagnostic.provider??"unknown"});
      }
      this.metric?.("web.research.search_duration_ms",Date.now()-searchStarted);
    }

    const unique=dedupe(candidates),ranked=rankCandidates(unique,query).slice(0,maxSources);
    this.metric?.("web.research.sources_found",unique.length);
    const articles:WebResearchResult["articles"]=[];let totalChars=0;
    const fetchStarted=Date.now();
    for(const candidate of ranked){
      if(signal?.aborted)throw signal.reason??new Error("Pesquisa cancelada.");
      try{
        const remaining=MAX_TOTAL_CHARS-totalChars;if(remaining<=0)break;
        const doc=await this.reader.fetch(candidate.url,Math.min(MAX_CHARS_PER_SOURCE,remaining),signal);
        if(!doc.text.trim()){
          const diagnostic:WebDiagnostic={stage:"EXTRACTION",url:candidate.url,errorCode:"EMPTY_TEXT",message:"Nenhum conteúdo textual extraído."};
          diagnostics.push(diagnostic);failedSources.push({url:candidate.url,error:diagnostic.message,stage:"EXTRACTION"});this.metric?.("web.extract.empty",1);continue;
        }
        totalChars+=doc.text.length;
        articles.push({title:doc.title||candidate.title||candidate.url,url:doc.url,snippet:candidate.snippet??doc.text.slice(0,280),text:doc.text,publishedAt:candidate.publishedAt,source:source?.name??source?.domain});
      }catch(error){
        const stage=failureStage(error),diagnostic=diagnosticFor(error,stage,undefined,candidate.url);
        diagnostics.push(diagnostic);failedSources.push({url:candidate.url,error:diagnostic.message,stage});
        this.metric?.(failureMetric(stage,error),1);
      }
    }
    this.metric?.("web.research.fetch_duration_ms",Date.now()-fetchStarted,{phase:"articles"});
    this.metric?.("web.research.sources_fetched",articles.length);

    const status:WebResearchResult["status"]=articles.length
      ?(failedSources.length?"partial":"full")
      :searchResults.length?"search_only":"failed";
    const partial=status==="partial"||status==="search_only";
    this.metric?.(`web.research.${status}`,1,{articles:articles.length,searchResults:searchResults.length});
    return{query,source:source?{name:source.name,domain:source.domain,url:source.url}:undefined,articles,searchResults,failedSources,diagnostics,status,partial,untrustedExternalContent:true};
  }
}

function isHeadlineRequest(query:string){return /\b(principais|ultim[ao]s?|recentes?|manchetes?|not[ií]cias?|destaques?)\b/i.test(query);}
function sameDomain(url:string,domain:string){try{const host=new URL(url).hostname.replace(/^www\./,"").toLowerCase(),wanted=domain.replace(/^www\./,"").toLowerCase();return host===wanted||host.endsWith(`.${wanted}`);}catch{return false;}}
function dedupe(items:WebArticleCandidate[]){const seen=new Set<string>(),result:WebArticleCandidate[]=[];for(const item of items){let key:string;try{const url=new URL(item.url);url.hash="";["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(param=>url.searchParams.delete(param));key=url.toString();}catch{continue;}if(seen.has(key))continue;seen.add(key);result.push({...item,url:key});}return result;}
function rankCandidates(items:WebArticleCandidate[],query:string){const terms=fold(query).split(" ").filter(term=>term.length>3&&!["principais","noticias","ultimas","recentes","destaques","manchetes"].includes(term));return items.map(item=>({item,score:(item.homepageRank===undefined?0:60-Math.min(item.homepageRank,20)*2)+(item.searchRank===undefined?0:50-Math.min(item.searchRank,8)*5)+terms.reduce((score,term)=>score+(fold(item.title+" "+(item.snippet??"")).includes(term)?8:0),0)+recencyScore(item.publishedAt)})).sort((a,b)=>b.score-a.score).map(row=>row.item);}
function recencyScore(value?:string){if(!value)return 0;const time=Date.parse(value);if(!Number.isFinite(time))return 0;const days=(Date.now()-time)/86_400_000;return days<=1?15:days<=7?10:days<=30?5:0;}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function message(error:unknown){return error instanceof Error?error.message:String(error);}
function errorCode(error:unknown){const value=error&&typeof error==="object"?(error as NodeJS.ErrnoException).code:undefined;const msg=message(error);if(/HTTP\s*(\d+)/i.test(msg))return`HTTP_${msg.match(/HTTP\s*(\d+)/i)?.[1]}`;return value?String(value):undefined;}
function diagnosticFor(error:unknown,stage:WebFailureStage,provider?:string,url?:string):WebDiagnostic{return{stage,...(provider?{provider}:{}),...(url?{url}:{}),...(errorCode(error)?{errorCode:errorCode(error)}:{}),message:message(error)};}
function failureStage(error:unknown):WebFailureStage{const value=message(error);if(/redirecion/i.test(value))return"REDIRECT";if(/conte[uú]do|content[- ]type|HTML|texto simples/i.test(value))return"CONTENT_TYPE";if(/privado|reservado|porta|HTTP\/HTTPS públicas|bloquead/i.test(value))return"SECURITY";if(/extra[cç]|vazio|empty/i.test(value))return"EXTRACTION";return"FETCH";}
function failureMetric(stage:WebFailureStage,error:unknown){const value=message(error);if(stage==="FETCH"&&/HTTP\s*403/i.test(value))return"web.fetch.http_403";if(stage==="FETCH"&&/tempo limite|timeout/i.test(value))return"web.fetch.timeout";if(stage==="CONTENT_TYPE")return"web.fetch.invalid_content_type";if(stage==="EXTRACTION")return"web.extract.empty";if(stage==="SOURCE_RESOLUTION")return"web.source.resolve_failed";return"web.research.no_readable_sources";}
