import { WebResearchService } from "../packages/core/dist/web/research-service.js";

const sourceName=process.argv[2]??"InfoMoney";
const query=process.argv.slice(3).join(" ")||"principais notícias";
const service=new WebResearchService();

console.log(`Pesquisando conteúdo real em ${sourceName}: ${query}`);
const result=await service.research({sourceName,query,maxSources:5});

console.log(JSON.stringify({
  query:result.query,
  source:result.source,
  partial:result.partial,
  articles:result.articles.map(article=>({
    title:article.title,
    url:article.url,
    snippet:article.snippet.slice(0,240),
    textPreview:article.text.slice(0,400)
  })),
  failedSources:result.failedSources
},null,2));

if(!result.articles.length)process.exitCode=1;
