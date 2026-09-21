import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {PresentationAdapter} from "../types.js";

const resultSchema=z.object({
  results:z.array(z.object({
    title:z.string().optional(),
    url:z.string().url(),
    snippet:z.string().optional()
  }))
});

export const webSearchAdapter:PresentationAdapter=result=>{
  const parsed=resultSchema.safeParse(result.data);
  if(!parsed.success)return undefined;
  const items=parsed.data.results.map((item,index)=>({
    id:randomUUID(),
    resource:{
      kind:"generic" as const,
      title:item.title?.trim()||`Resultado ${index+1}`,
      subtitle:item.url,
      description:item.snippet?.trim()||undefined,
      metadata:[{label:"URL",value:item.url}]
    },
    actions:[]
  }));
  return{
    presentation:{version:1,blocks:[{id:randomUUID(),version:1,type:"resource_collection",domain:"generic",title:"Resultados da pesquisa web",total:items.length,items}]},
    bindings:[]
  };
};
