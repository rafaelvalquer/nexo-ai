import {extractArticleCandidates} from "./article-extractor.js";
import {WebReaderService} from "./reader-service.js";
import {WebSourceResolver} from "./source-resolver.js";
import type {WebArticleCandidate,WebResearchHeadline,WebResearchInput,WebResearchResult} from "./types.js";

type Metric=(name:string,value:number,tags?:Record<string,string|number|boolean>)=>void;
const MAX_SEARCH_RESULTS=8,MAX_FETCHED_SOURCES=5,MAX_CHARS_PER_SOURCE=5_000,MAX_TOTAL_CHARS=25_000;

export class WebResearchService{
  readonly sourceResolver:WebSourceResolver;
  constructor(private readonly reader=new WebReaderService(),private readonly metric?:Metric){this.sourceResolver=new WebSourceResolver(reader);}
  async research(input:WebResearchInput,signal?:AbortSignal):Promise<WebResearchResult>{
    const started=Date.now();this.metric?.("web.research.started",1);
    const maxSources=Math.min(Math.max(input.maxSources??MAX_FETCHED_SOURCES,1),MAX_FETCHED_SOURCES);
    const source=await this.sourceResolver.resolve(input,signal);
    const query=input.query.trim(),headlineRequest=isHeadlineRequest(query);
    const candidates:WebArticleCandidate[]=[];
    const failedSources:Array<{url:string;error:string}>=[];

    if(input.url)candidates.push({title:"",url:input.url,searchRank:0,discoveredFrom:"direct"});
    else{
      if(source?.url&&headlineRequest){
        const homeStarted=Date.now();
        try{
          const home=await this.reader.fetchHtml(source.url,signal);
          candidates.push(...extractArticleCandidates(home.html,home.url).slice(0,20).map(item=>({...item,discoveredFrom:"homepage" as const})));
        }catch(error){failedSources.push({url:source.url,error:message(error)});}
        this.metric?.("web.research.fetch_duration_ms",Date.now()-homeStarted,{phase:"homepage"});
      }

      const searchQueries=buildSearchQueries(query,source?.domain,headlineRequest);
      const searchStarted=Date.now();
      for(let pass=0;pass<searchQueries.length;pass++){
        try{
          const search=await this.reader.search(searchQueries[pass],MAX_SEARCH_RESULTS,signal);
          search.results.forEach((item,index)=>{
            if(source?.domain&&!sameDomain(item.url,source.domain))return;
            candidates.push({title:item.title,url:item.url,snippet:item.snippet,searchRank:index+pass*2,discoveredFrom:"search"});
          });
        }catch(error){
          failedSources.push({url:`search:${searchQueries[pass]}`,error:message(error)});
        }
      }
      this.metric?.("web.research.search_duration_ms",Date.now()-searchStarted);
    }

    const unique=dedupe(candidates),ranked=rankCandidates(unique,query).slice(0,maxSources);
    this.metric?.("web.research.sources_found",unique.length);
    const articles=[];let totalChars=0;
    const fetchStarted=Date.now();
    for(const candidate of ranked){
      if(signal?.aborted)throw signal.reason??new Error("Pesquisa cancelada.");
      try{
        const remaining=MAX_TOTAL_CHARS-totalChars;if(remaining<=0)break;
        const doc=await this.reader.fetch(candidate.url,Math.min(MAX_CHARS_PER_SOURCE,remaining),signal);
        if(!doc.text.trim())continue;
        totalChars+=doc.text.length;
        articles.push({title:doc.title||candidate.title||candidate.url,url:doc.url,snippet:candidate.snippet??doc.text.slice(0,280),text:doc.text,publishedAt:candidate.publishedAt,source:source?.name??source?.domain});
      }catch(error){failedSources.push({url:candidate.url,error:message(error)});}
    }
    this.metric?.("web.research.fetch_duration_ms",Date.now()-fetchStarted,{phase:"articles"});
    this.metric?.("web.research.sources_fetched",articles.length);

    const headlines=buildHeadlines(ranked,articles,source?.name??source?.domain);
    this.metric?.("web.research.headlines_discovered",headlines.length);
    const partial=failedSources.length>0||articles.length<Math.min(maxSources,ranked.length);
    if(partial)this.metric?.("web.research.partial",1);
    if(!articles.length&&!headlines.length)this.metric?.("web.research.failed",1);
    this.metric?.("web.research.total_duration_ms",Date.now()-started);
    return{query,source:source?{name:source.name,domain:source.domain,url:source.url}:undefined,articles,headlines,failedSources,partial,untrustedExternalContent:true};
  }
}

function buildSearchQueries(query:string,domain:string|undefined,headlineRequest:boolean){
  if(!domain)return[query];
  const primary=`site:${domain} ${query}`;
  if(!headlineRequest)return[primary];
  return[primary,`site:${domain} notícias hoje`];
}
function buildHeadlines(ranked:WebArticleCandidate[],articles:Array<{title:string;url:string;snippet:string;publishedAt?:string}>,source?:string):WebResearchHeadline[]{
  const readByUrl=new Map(articles.map(article=>[canonicalUrl(article.url),article]));
  const result:WebResearchHeadline[]=[];
  for(const candidate of ranked){
    const read=readByUrl.get(canonicalUrl(candidate.url));
    const title=(read?.title||candidate.title||"").trim();if(!title)continue;
    result.push({
      title,
      url:read?.url??candidate.url,
      snippet:(read?.snippet??candidate.snippet??"").trim(),
      publishedAt:read?.publishedAt??candidate.publishedAt,
      source,
      discoveredFrom:candidate.discoveredFrom??"search",
      fullyRead:Boolean(read)
    });
  }
  for(const article of articles){
    if(result.some(item=>canonicalUrl(item.url)===canonicalUrl(article.url)))continue;
    result.push({title:article.title,url:article.url,snippet:article.snippet,publishedAt:article.publishedAt,source,discoveredFrom:"direct",fullyRead:true});
  }
  return result;
}
function isHeadlineRequest(query:string){return /\b(principais|ultim[ao]s?|recentes?|manchetes?|not[ií]cias?|destaques?)\b/i.test(query);}
function sameDomain(url:string,domain:string){try{const host=new URL(url).hostname.replace(/^www\./,"").toLowerCase(),wanted=domain.replace(/^www\./,"").toLowerCase();return host===wanted||host.endsWith(`.${wanted}`);}catch{return false;}}
function dedupe(items:WebArticleCandidate[]){const seen=new Set<string>(),result:WebArticleCandidate[]=[];for(const item of items){const key=canonicalUrl(item.url);if(!key||seen.has(key))continue;seen.add(key);result.push({...item,url:key});}return result;}
function canonicalUrl(value:string){try{const url=new URL(value);url.hash="";["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(param=>url.searchParams.delete(param));return url.toString();}catch{return"";}}
function rankCandidates(items:WebArticleCandidate[],query:string){const terms=fold(query).split(" ").filter(term=>term.length>3&&!["principais","noticias","ultimas","recentes","destaques","manchetes"].includes(term));return items.map(item=>({item,score:(item.homepageRank===undefined?0:60-Math.min(item.homepageRank,20)*2)+(item.searchRank===undefined?0:50-Math.min(item.searchRank,10)*4)+terms.reduce((score,term)=>score+(fold(item.title+" "+(item.snippet??"")).includes(term)?8:0),0)+recencyScore(item.publishedAt)})).sort((a,b)=>b.score-a.score).map(row=>row.item);}
function recencyScore(value?:string){if(!value)return 0;const time=Date.parse(value);if(!Number.isFinite(time))return 0;const days=(Date.now()-time)/86_400_000;return days<=1?15:days<=7?10:days<=30?5:0;}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function message(error:unknown){return error instanceof Error?error.message:String(error);}
