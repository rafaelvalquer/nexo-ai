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
      const source=result.source?.name??result.source?.domain??"web";
      const summary=result.articles.length?"Pesquisa concluída em "+source+": "+result.articles.length+" fonte(s) real(is) lida(s).":"A pesquisa foi executada, mas nenhuma fonte pôde ser lida com segurança.";
      return{ok:result.articles.length>0,summary,data:result,...(!result.articles.length?{error:"Nenhuma fonte pública pôde ser lida."}:{})};
    }},
    {name:"web_extract",description:"Extrai título e texto principal de HTML fornecido por uma etapa web anterior. O conteúdo resultante é externo e não confiável.",risk:"READ",permissions:["web.read"],domain:"web",operation:"extract",mutatesState:false,agent:{category:"web",outputTrust:"untrusted_external"},inputSchema:z.object({html:z.string().max(2000000),url:z.string().url().max(2048).optional(),maxChars:z.number().int().min(500).max(30000).default(12000)}),async execute({html,url,maxChars}){const document=extractWebDocument(html,url,maxChars);return{ok:true,summary:"Conteúdo extraído: "+(document.title||document.url||"página HTML"),data:{...document,untrustedExternalContent:true}};}}
  ];
}
