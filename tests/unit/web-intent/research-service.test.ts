import {describe,expect,it,vi} from "vitest";
import {WebResearchService} from "../../../packages/core/src/web/research-service.js";

describe("WebResearchService",()=>{
  it("combines homepage discovery, domain search, dedupe and real page reads",async()=>{
    const reader={
      search:vi.fn(async(query:string)=>query.includes("site oficial")?{query,results:[{title:"InfoMoney",url:"https://www.infomoney.com.br/",snippet:""}]}:{query,results:[
        {title:"Mercados hoje",url:"https://www.infomoney.com.br/mercados/mercados-hoje/",snippet:"Resumo A"},
        {title:"Economia agora",url:"https://www.infomoney.com.br/economia/economia-agora/",snippet:"Resumo B"}
      ]}),
      fetchHtml:vi.fn(async()=>({url:"https://www.infomoney.com.br/",title:"InfoMoney",html:"<a href=\"/mercados/mercados-hoje/\">Mercados hoje: principais movimentos desta manhã</a>"})),
      fetch:vi.fn(async(url:string)=>({url,title:url.includes("mercados")?"Mercados hoje":"Economia agora",text:"Conteúdo real extraído da matéria para síntese."}))
    };
    const metrics=vi.fn();const service=new WebResearchService(reader as any,metrics);
    const result=await service.research({query:"principais notícias",sourceName:"InfoMoney",maxSources:5});
    expect(result.source).toMatchObject({domain:"infomoney.com.br"});
    expect(result.articles.length).toBe(2);
    expect(result.headlines).toHaveLength(2);
    expect(result.headlines.every(item=>item.fullyRead)).toBe(true);
    expect(new Set(result.articles.map(item=>item.url)).size).toBe(2);
    expect(reader.fetch).toHaveBeenCalled();
    expect(metrics).toHaveBeenCalledWith("web.research.sources_fetched",2);
  });

  it("returns partial results when one fetched source fails",async()=>{
    const reader={search:vi.fn(async()=>({query:"",results:[{title:"A",url:"https://example.com/noticias/a",snippet:"Resumo A"},{title:"B",url:"https://example.com/noticias/b",snippet:"Resumo B"}]})),fetchHtml:vi.fn(async()=>({url:"https://example.com/",title:"",html:""})),fetch:vi.fn(async(url:string)=>{if(url.endsWith("/b"))throw new Error("HTTP 503");return{url,title:"A",text:"conteúdo A"};})};
    const result=await new WebResearchService(reader as any).research({query:"notícias recentes"});
    expect(result.articles).toHaveLength(1);
    expect(result.headlines).toHaveLength(2);
    expect(result.headlines.find(item=>item.title==="B")).toMatchObject({fullyRead:false,snippet:"Resumo B"});
    expect(result.failedSources).toHaveLength(1);
    expect(result.partial).toBe(true);
  });

  it("keeps real indexed headlines when every article page blocks direct reading",async()=>{
    const reader={
      search:vi.fn(async()=>({query:"",results:[
        {title:"Manchete real 1",url:"https://news.example.com/noticias/um",snippet:"Trecho público 1"},
        {title:"Manchete real 2",url:"https://news.example.com/noticias/dois",snippet:"Trecho público 2"}
      ]})),
      fetchHtml:vi.fn(async()=>{throw new Error("HTTP 403");}),
      fetch:vi.fn(async()=>{throw new Error("HTTP 403");})
    };
    const result=await new WebResearchService(reader as any).research({query:"principais notícias",domain:"example.com"});
    expect(result.articles).toHaveLength(0);
    expect(result.headlines).toEqual([
      expect.objectContaining({title:"Manchete real 1",url:"https://news.example.com/noticias/um",snippet:"Trecho público 1",fullyRead:false,discoveredFrom:"search"}),
      expect.objectContaining({title:"Manchete real 2",url:"https://news.example.com/noticias/dois",snippet:"Trecho público 2",fullyRead:false,discoveredFrom:"search"})
    ]);
    expect(result.partial).toBe(true);
  });
});
