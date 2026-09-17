import { z } from "zod";
import type { MacroEngine } from "../../macros/macro-engine.js";
import type { ToolDefinition } from "../types.js";
import type { CreateAutomationV2Input } from "@nexo/shared";

export function macroTools(macros:MacroEngine,db:import("../../database/db.js").NexoDatabase,draft:(description:string,name?:string)=>Promise<import("../../automation/natural-draft.js").MacroDraft>):ToolDefinition[]{
  return [
    {name:"macro_create_draft",description:"Inicia ou continua a criação conversacional de uma macro. Se o usuário informou apenas o nome, pergunte o que ela deve fazer. Quando chegar a descrição, gere ações válidas usando apenas o catálogo e apresente todas as etapas; nunca salve antes de confirmação explícita.",domain:"macro",operation:"draft",risk:"READ",mutatesState:false,permissions:[],inputSchema:z.object({name:z.string().trim().min(1).max(160).optional(),description:z.string().trim().min(8).max(3000).optional()}),async execute({name,description},context){
      if(!context?.conversationId)throw new Error("Não foi possível associar o rascunho à conversa atual.");
      const key=`macro-draft:${context.conversationId}`,pending=db.get<{value:string}>("SELECT value FROM application_state WHERE key=?",[key]);
      if(!description){if(!name)throw new Error("Informe o nome da macro.");db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[key,JSON.stringify({name,waitingForDescription:true})]);return{ok:true,summary:`O que a macro “${name}” deve fazer? Descreva as etapas na ordem desejada.`,data:{name,waitingForDescription:true}};}
      let previousName:string|undefined;try{previousName=pending?JSON.parse(pending.value).name:undefined;}catch{/* Replace invalid local draft with a fresh one. */}
      const value=await draft(description,name??previousName);db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[key,JSON.stringify(value)]);
      return{ok:true,summary:`Rascunho da macro “${value.name}” pronto para revisão. Confira as ${value.actions.length} etapas. Para criar a macro, responda “confirmo a criação da macro”. Para descartar, diga “cancele o rascunho”.`,data:value};
    }},
    {name:"macro_confirm_draft",description:"Salva ou descarta o rascunho de macro atual após confirmação explícita do usuário.",domain:"macro",operation:"confirm_draft",risk:"WRITE",mutatesState:true,permissions:[],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},inputSchema:z.object({confirm:z.boolean()}),async execute({confirm},context){
      if(!context?.conversationId)throw new Error("Não foi possível localizar o rascunho desta conversa.");const key=`macro-draft:${context.conversationId}`;
      const result=db.transaction(()=>{const row=db.get<{value:string}>("SELECT value FROM application_state WHERE key=?",[key]);if(!row)throw new Error("Não há rascunho pendente nesta conversa.");if(!confirm){db.run("DELETE FROM application_state WHERE key=?",[key]);return{discarded:true as const};}
        const value=JSON.parse(row.value) as {name:string;description:string;actions:Array<{id:string;type:string;config:Record<string,unknown>}>};
        const saved=macros.create({name:value.name,prompt:value.description,description:value.description,icon:"zap",enabled:true,trigger:{type:"manual"},conditions:[],conditionOperator:"AND",actions:value.actions,output:{type:"notification"},policy:{maxConcurrentRuns:1,retries:{enabled:true,count:2},onRepeatedFailure:"pause"}} as CreateAutomationV2Input);
        db.run("DELETE FROM application_state WHERE key=?",[key]);return{id:saved.id,name:saved.name,enabled:saved.enabled};
      });
      return result.discarded?{ok:true,summary:"Rascunho descartado.",data:result}:{ok:true,summary:`Macro “${result.name}” criada e pronta para execução manual.`,data:result};
    }},
    {name:"macro_list",description:"Lista macros salvas e informa quais estão ativas",domain:"macro",operation:"list",risk:"READ",mutatesState:false,permissions:[],inputSchema:z.object({}),async execute(){
      const items=macros.list().map(item=>({id:item.id,name:item.name,enabled:item.enabled,status:item.status,nextRunAt:item.nextRunAt}));
      return{ok:true,summary:items.length?items.map(item=>`${item.name} · ${item.enabled?"ativa":"pausada"}`).join("\n"):"Ainda não há macros salvas.",data:items};
    }},
    {name:"macro_run",description:"Executa uma macro existente pelo nome; todas as etapas continuam sujeitas às permissões e confirmações configuradas",domain:"macro",operation:"run",risk:"CRITICAL",mutatesState:true,permissions:[],mutationSafety:{idempotency:"none",reconciliation:"not_supported"},inputSchema:z.object({name:z.string().trim().min(1).max(160)}),async execute({name},context){
      const normalized=normalize(name),matches=macros.list().filter(item=>normalize(item.name)===normalized);
      if(matches.length===0)throw new Error(`Não encontrei a macro “${name}”. Consulte a lista de macros ou confira o nome.`);
      if(matches.length>1)throw new Error(`Há mais de uma macro chamada “${name}”. Renomeie uma delas antes de executar.`);
      const macro=matches[0]!;if(!macro.enabled)throw new Error(`A macro “${macro.name}” está pausada. Ative-a em Macros antes de executar.`);
      const abort=()=>macros.cancel(macro.id);context?.signal?.addEventListener("abort",abort,{once:true});
      try{const result=await macros.run(macro.id);return{ok:true,summary:`Macro “${macro.name}” iniciada. Execução ${result.id}.`,data:result};}
      finally{context?.signal?.removeEventListener("abort",abort);}
    }}
  ];
}

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();}
