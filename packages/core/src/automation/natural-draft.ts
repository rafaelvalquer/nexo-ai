import { randomUUID } from "node:crypto";
import type { AutomationAction } from "@nexo/shared";
import type { AutomationActionCatalogItem } from "./actions/catalog.js";

export type MacroDraft={name:string;description:string;actions:AutomationAction[]};

export function normalizeMacroDraft(raw:string,description:string,name?:string,catalog:AutomationActionCatalogItem[]=[]):MacroDraft{
  let parsed:any;
  try{parsed=JSON.parse(raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""));}
  catch{throw new Error("A IA não retornou uma definição de macro válida. Tente descrever a rotina de forma mais direta.");}
  if(!parsed||!Array.isArray(parsed.actions)||parsed.actions.length<1||parsed.actions.length>20)throw new Error("A definição gerada deve conter entre 1 e 20 etapas.");
  const actions:AutomationAction[]=parsed.actions.map((candidate:any,index:number)=>{
    if(!candidate||typeof candidate.type!=="string"||!candidate.config||typeof candidate.config!=="object"||Array.isArray(candidate.config))throw new Error(`A etapa ${index+1} está inválida.`);
    const definition=catalog.find(item=>item.id===candidate.type);if(!definition)throw new Error(`A IA sugeriu uma ação não permitida na etapa ${index+1}.`);
    const allowed=new Set(definition.fields.map(field=>field.key));
    const config=Object.fromEntries(Object.entries(candidate.config).filter(([key,value])=>allowed.has(key)&&["string","number","boolean"].includes(typeof value)));
    for(const field of definition.fields)if(field.required&&config[field.key]===undefined)config[field.key]="";
    return{id:randomUUID(),type:definition.id,config};
  });
  const generatedName=typeof parsed.name==="string"?parsed.name.trim().slice(0,160):"";
  return{name:(name?.trim()||generatedName||"Nova macro").slice(0,160),description:description.trim(),actions};
}
