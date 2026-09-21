import type {WebSearchProvider} from "./web-search-provider.js";
import type {WebSearchProviderResult} from "./types.js";

type Metric=(name:string,value:number,tags?:Record<string,string|number|boolean>)=>void;
export class SearchProviderChain{
  constructor(private readonly providers:WebSearchProvider[],private readonly metric?:Metric){}
  async search(query:string,limit:number,signal?:AbortSignal):Promise<WebSearchProviderResult>{
    let lastError:unknown;
    for(let index=0;index<this.providers.length;index++){
      const provider=this.providers[index];
      try{
        const results=await provider.search(query,limit,signal);
        if(results.length)return{provider:provider.name,query,results};
        this.metric?.("web.search.zero_results",1,{provider:provider.name});
        if(index<this.providers.length-1)this.metric?.("web.search.provider_fallback",1,{from:provider.name,to:this.providers[index+1].name});
      }catch(error){
        lastError=error;
        if(index<this.providers.length-1)this.metric?.("web.search.provider_fallback",1,{from:provider.name,to:this.providers[index+1].name});
      }
    }
    if(lastError)throw lastError;
    return{provider:this.providers.at(-1)?.name??"none",query,results:[]};
  }
}
