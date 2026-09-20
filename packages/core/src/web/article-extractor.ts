import type {WebArticleCandidate} from "./types.js";

export function extractArticleCandidates(html:string,baseUrl:string):WebArticleCandidate[]{
  const base=new URL(baseUrl),items:WebArticleCandidate[]=[];
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)){
    const raw=match[1],title=clean(match[2]??"");if(title.length<18||title.length>240)continue;
    let url:URL;try{url=new URL(raw,base);}catch{continue;}
    if(url.origin!==base.origin||!["http:","https:"].includes(url.protocol))continue;
    if(!likelyArticlePath(url.pathname))continue;
    if(items.some(item=>item.url===url.toString()))continue;
    items.push({title,url:url.toString(),homepageRank:items.length});
    if(items.length>=40)break;
  }
  for(const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const value=JSON.parse(block[1]);
      for(const node of flattenJsonLd(value)){
        const type=String(node?.["@type"]??"");
        if(!/(NewsArticle|Article|ReportageNewsArticle)/i.test(type))continue;
        const rawUrl=node.url??node.mainEntityOfPage?.["@id"];const headline=String(node.headline??node.name??"").trim();
        if(!rawUrl||!headline)continue;
        const url=new URL(String(rawUrl),base);if(url.origin!==base.origin)continue;
        if(!items.some(item=>item.url===url.toString()))items.push({title:headline,url:url.toString(),publishedAt:stringOrUndefined(node.datePublished),homepageRank:items.length});
      }
    }catch{/* Invalid page JSON-LD is ignored as untrusted input. */}
  }
  return items;
}
function likelyArticlePath(pathname:string){const path=pathname.toLowerCase();if(path==="/"||path.length<5)return false;if(/\/(tag|tags|autor|author|category|categoria|busca|search|login|newsletter|contato|about)(\/|$)/.test(path))return false;return path.split("/").filter(Boolean).length>=2||/\d{4}\/\d{2}/.test(path);}
function clean(value:string){return decode(value.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function decode(value:string){return value.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi," ");}
function flattenJsonLd(value:any):any[]{if(Array.isArray(value))return value.flatMap(flattenJsonLd);if(value&&typeof value==="object"&&Array.isArray(value["@graph"]))return[value,...value["@graph"].flatMap(flattenJsonLd)];return value&&typeof value==="object"?[value]:[];}
function stringOrUndefined(value:unknown){return typeof value==="string"&&value.trim()?value.trim():undefined;}
