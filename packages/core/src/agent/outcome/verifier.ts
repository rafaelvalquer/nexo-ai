import fs from "node:fs";
import type {ToolResult} from "@nexo/shared";
import {outcomeContracts} from "./contracts.js";
import type {GoalOutcome} from "./types.js";

export class OutcomeVerifier{
 verify(input:{userRequest:string;toolName:string;result:ToolResult;before?:unknown}):GoalOutcome{
  const{userRequest,toolName,result}=input;
  if(!result.ok)return{status:"failed",verified:true,reason:result.error?.message??result.summary,evidence:["tool_result_failed"]};
  const contract=outcomeContracts[toolName];
  if(!contract)return{status:"unknown",verified:false,reason:"NO_OUTCOME_CONTRACT"};
  const data=(result.data??{}) as any;
  if(toolName==="web_research")return verifyWebResearch(userRequest,data);
  if(["create_folder","create_text_file","write_text_file","copy_file","move_file","rename_file"].includes(toolName)){
    const target=firstString(data,["createdPath","path","destination","newPath"]);
    if(!target)return{status:"failed",verified:true,reason:"A ferramenta não retornou o caminho produzido."};
    if(isPhysicalPath(target)&&!fs.existsSync(target))return{status:"failed",verified:true,reason:"O caminho retornado não existe após a execução.",evidence:[target]};
    return{status:"success",verified:true,evidence:[target]};
  }
  if(/^email_(?:send|send_composed|reply)$/.test(toolName)){
    const id=firstString(data,["messageId","id"]);return id?{status:"success",verified:true,evidence:[id]}:{status:"failed",verified:true,reason:"O provedor não retornou messageId."};
  }
  if(/^calendar_(?:create|create_meeting|update|delete|rsvp)$/.test(toolName)){
    const id=firstString(data,["eventId","id"]);return id||toolName==="calendar_delete"?{status:"success",verified:true,evidence:id?[id]:["deleted"]}:{status:"failed",verified:true,reason:"O provedor não retornou identificador do evento."};
  }
  if(/^document_(?:create|summarize)/.test(toolName)){
    const id=firstString(data,["documentId","id","path","summary","text","content"]);return id?{status:"success",verified:true,evidence:[String(id).slice(0,160)]}:{status:"failed",verified:true,reason:"O documento não retornou a saída exigida."};
  }
  const missing=contract.requiredOutput.filter(expr=>!hasAlternative(data,expr));
  if(missing.length)return{status:"failed",verified:true,reason:`Saída obrigatória ausente: ${missing.join(", ")}`};
  return{status:"success",verified:true,evidence:[result.summary]};
 }
}
function verifyWebResearch(request:string,data:any):GoalOutcome{
 const articles=Array.isArray(data?.articles)?data.articles:[],headlines=Array.isArray(data?.headlines)?data.headlines:[];
 const evidenceCount=new Set([...articles,...headlines].map((item:any)=>item?.url).filter(Boolean)).size||Math.max(articles.length,headlines.length);
 if(evidenceCount===0)return{status:"failed",verified:true,reason:"Nenhuma fonte ou manchete verificável foi retornada."};
 const requested=requestedCount(request);
 if(requested&&evidenceCount<requested)return{status:"partial",verified:true,unmetGoals:[`faltaram ${requested-evidenceCount} notícia(s)`],evidence:[`${evidenceCount}/${requested}`]};
 return{status:"success",verified:true,evidence:[`${evidenceCount} fonte(s)`]};
}
function requestedCount(text:string){const m=text.match(/\b(?:traga|mostre|pesquise|procure|liste)?\s*(\d{1,2})\s+(?:not[ií]cias?|fontes?|resultados?)/i);return m?Math.min(20,Math.max(1,Number(m[1]))):undefined;}
function hasAlternative(data:any,expr:string){return expr.split("|").some(key=>{const value=data?.[key];return Array.isArray(value)?value.length>0:value!==undefined&&value!==null&&value!=="";});}
function firstString(data:any,keys:string[]){for(const key of keys){const value=data?.[key];if(typeof value==="string"&&value.trim())return value.trim();}return undefined;}
function isPhysicalPath(value:string){return /^[A-Za-z]:[\\/]|^\//.test(value);}
