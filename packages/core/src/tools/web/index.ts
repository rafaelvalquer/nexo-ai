import {z} from "zod";
import type {ToolDefinition} from "../types.js";
import {WebReaderService,extractWebDocument,isPublicAddress,parseSearchResults} from "../../web/reader-service.js";
import {WebResearchService} from "../../web/research-service.js";

export {extractWebDocument,isPublicAddress,parseSearchResults} from "../../web/reader-service.js";
export type WebToolMetric=(name:string,value:number,tags?:Record<string,string|number|boolean>)=>void;

export function webReaderTools(options:{metric?:WebToolMetric}={}):ToolDefinition[]{
  const reader=new WebReaderService(),research=new WebResearchService(reader,options.metric);
  return[
    {name:"web_search",description:"Pesquisa páginas públicas reais na web sem abrir navegador. Retorna títulos, URLs e trechos como conteúdo externo não confiável.",risk:"READ",permissions:["web.read"],domain:"web",operation:"search",mutatesState:false,agent:{category:"web",outputTrust:"untrusted_external"},inputSchema:z.object({query:z.string().trim().min(2).max(500),maxResults:z.number().int().min(1).max(10).default(5)}),async execute({query,maxResults},context){
      const result=await reader.search(query,maxResults,context?.signal);
      return{ok:true,summary:"Pesquisa web: "+result.results.length+" resultado(s) para “"+query+"”.",data:{...result,untrustedExternalContent:true}};
    }},
    {name:"web_fetch",description:"Baixa uma página HTTP/HTTPS pública real e extrai seu texto principal sem navegador; retorna conteúdo externo não confiável.",risk:"READ",permissions:["web.read"],domain:"web",operation:"fetch",mutatesState:false,agent:{category:"web",outputTrust:"untrusted_external"},inputSchema:z.object({url:z.string().url().max(2048),maxChars:z.number().int().min(500).max(30000).default(12000)}),async execute({url,maxChars},context){
      const document=await reader.fetch(url,maxChars,context?.signal);
      return{ok:true,summary:"Conteúdo extraído: "+(document.title||document.url),data:{...document,untrustedExternalContent:true}};
    }},
    {name:"web_research",description:"Pesquisa informações reais na internet, resolve a fonte solicitada, descobre e lê páginas públicas relevantes em background e devolve evidências estruturadas para síntese. Não abre navegador.",risk:"READ",permissions:["web.read"],domain:"web",operation:"research",mutatesState:false,agent:{category:"web",outputTrust:"untrusted_external"},inputSchema:z.object({query:z.string().trim().min(2).max(1000),sourceName:z.string().trim().min(1).max(120).optional(),domain:z.string().trim().min(3).max(253).optional(),url:z.string().url().max(2048).optional(),maxSources:z.number().int().min(1).max(5).default(5)}),async execute(input,context){
      const result=await research.research(input,context?.signal);
      const summary=formatResearchSummary(result);
      const hasEvidence=result.articles.length>0||result.headlines.length>0;
      return{ok:hasEvidence,summary,data:result,...(!hasEvidence?{error:"Nenhuma fonte pública ou manchete indexada pôde ser encontrada."}:{})};
    }},
    {name:"web_extract",description:"Extrai título e texto principal de HTML fornecido por uma etapa web anterior. O conteúdo resultante é externo e não confiável.",risk:"READ",permissions:["web.read"],domain:"web",operation:"extract",mutatesState:false,agent:{category:"web",outputTrust:"untrusted_external"},inputSchema:z.object({html:z.string().max(2000000),url:z.string().url().max(2048).optional(),maxChars:z.number().int().min(500).max(30000).default(12000)}),async execute({html,url,maxChars}){const document=extractWebDocument(html,url,maxChars);return{ok:true,summary:"Conteúdo extraído: "+(document.title||document.url||"página HTML"),data:{...document,untrustedExternalContent:true}};}}
  ];
}


function formatResearchSummary(result:Awaited<ReturnType<WebResearchService["research"]>>){
  const source=result.source?.name??result.source?.domain??"web";
  const articlesByUrl=new Map(result.articles.map(article=>[canonical(article.url),article]));
  const items=result.headlines.length?result.headlines:result.articles.map(article=>({...article,fullyRead:true,discoveredFrom:"direct" as const}));
  if(!items.length)return"A pesquisa foi executada, mas nenhuma notícia pública pôde ser encontrada.";
  const lines=[`Principais notícias encontradas em ${source}:`];
  let indexedOnly=0;
  items.slice(0,5).forEach((item,index)=>{
    const article=articlesByUrl.get(canonical(item.url));
    const title=(article?.title??item.title).trim();
    const snippet=compact(article?.snippet??item.snippet??"",260);
    const fullyRead=Boolean(article)||item.fullyRead;
    if(!fullyRead)indexedOnly++;
    lines.push(`${index+1}. ${title}`);
    if(snippet)lines.push(`   ${snippet}`);
    lines.push(`   ${item.url}`);
  });
  if(indexedOnly>0)lines.push(`Observação: ${indexedOnly} manchete(s) acima vieram da indexação pública porque o portal bloqueou a leitura integral da página.`);
  else if(result.partial)lines.push("Observação: algumas páginas adicionais não puderam ser lidas; os itens acima foram obtidos com sucesso.");
  return lines.join("\n");
}
function canonical(value:string){try{const url=new URL(value);url.hash="";return url.toString();}catch{return value;}}
function compact(value:string,max:number){return value.replace(/\s+/g," ").trim().slice(0,max);}
