import type {WebReaderService} from "./reader-service.js";

export type ResolvedWebSource={name?:string;domain?:string;url?:string};

export class WebSourceResolver{
  private readonly cache=new Map<string,ResolvedWebSource>();
  constructor(private readonly reader:WebReaderService){}
  async resolve(input:{sourceName?:string;domain?:string;url?:string},signal?:AbortSignal):Promise<ResolvedWebSource|undefined>{
    if(input.url){
      const url=new URL(input.url);return{name:input.sourceName,domain:url.hostname.replace(/^www\./,"").toLowerCase(),url:url.toString()};
    }
    if(input.domain){
      const domain=normalizeDomain(input.domain);if(!domain)return undefined;
      return{name:input.sourceName,domain,url:`https://${domain}/`};
    }
    const name=input.sourceName?.trim();if(!name)return undefined;
    const key=fold(name),cached=this.cache.get(key);if(cached)return cached;
    const search=await this.reader.search(`${name} site oficial`,5,signal);
    const ranked=search.results.map((item,index)=>({item,index,score:sourceScore(name,item.title,item.url,index)})).sort((a,b)=>b.score-a.score);
    const selected=ranked.find(row=>row.score>0)?.item;if(!selected)return undefined;
    const url=new URL(selected.url),resolved={name,domain:url.hostname.replace(/^www\./,"").toLowerCase(),url:`${url.protocol}//${url.host}/`};
    this.cache.set(key,resolved);return resolved;
  }
}
function normalizeDomain(value:string){const raw=value.trim().replace(/^https?:\/\//i,"").replace(/^www\./i,"").split("/")[0].toLowerCase();return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)?raw:undefined;}
function sourceScore(name:string,title:string,url:string,index:number){let host="";try{host=new URL(url).hostname.replace(/^www\./,"").toLowerCase();}catch{return-100;}const needle=fold(name).replace(/\s+/g,""),hostFold=fold(host).replace(/[^a-z0-9]/g,""),titleFold=fold(title);let score=20-index*2;if(needle&&hostFold.includes(needle))score+=50;if(titleFold.includes(fold(name)))score+=25;if(/facebook|instagram|linkedin|youtube|wikipedia|x\.com|twitter/.test(host))score-=60;return score;}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9. ]/g," ").replace(/\s+/g," ").trim();}
