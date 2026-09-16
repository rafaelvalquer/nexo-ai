import { z } from "zod";
import { genericAdapter } from "./generic.js";

const stats = z.object({ totalMessages: z.number(), totalThreads: z.number(), inboxMessages: z.number(), unreadMessages: z.number() });
export const emailStatsAdapter = genericAdapter(data => {
  const parsed = stats.safeParse(data);
  if (!parsed.success) return undefined;
  return [{ kind: "generic", title: "Sua caixa de e-mail", metadata: [
    { label: "Mensagens", value: String(parsed.data.totalMessages) },
    { label: "Conversas", value: String(parsed.data.totalThreads) },
    { label: "Caixa de entrada", value: String(parsed.data.inboxMessages) },
    { label: "Não lidas", value: String(parsed.data.unreadMessages) },
  ] }];
}, "Resumo de e-mail");

const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?String(Math.round(value*10)/10):undefined;
export const systemInfoAdapter=genericAdapter(data=>{if(!data||typeof data!=="object")return;const row=data as Record<string,unknown>;return[{kind:"generic",title:String(row.hostname??"Este computador"),subtitle:String(row.distro??row.platform??"Sistema"),metadata:[{label:"CPU",value:String(row.cpu??"Não informado")},{label:"Núcleos",value:String(row.cores??"Não informado")},{label:"Memória",value:`${finite(row.memoryGB)??"?"} GB`}]}];},"Informações do sistema");
export const memoryUsageAdapter=genericAdapter(data=>{if(!data||typeof data!=="object")return;const row=data as Record<string,unknown>;return[{kind:"generic",title:"Uso de memória",metadata:[{label:"Total",value:`${finite(row.totalGB)??"?"} GB`},{label:"Em uso",value:`${finite(row.usedGB)??"?"} GB`},{label:"Disponível",value:`${finite(row.availableGB)??"?"} GB`}]}];},"Memória");
export const diskUsageAdapter=genericAdapter(data=>Array.isArray(data)?data.map((item:any)=>({kind:"generic" as const,title:String(item.mount??item.fs??"Disco"),metadata:[{label:"Capacidade",value:`${finite(item.sizeGB)??"?"} GB`},{label:"Usado",value:`${finite(item.usedGB)??"?"} GB`},{label:"Ocupação",value:`${finite(item.use)??"?"}%`}]})):undefined,"Discos");
export const processListAdapter=genericAdapter(data=>Array.isArray(data)?data.map((item:any)=>({kind:"generic" as const,title:String(item.name??"Processo"),subtitle:`PID ${String(item.pid??"-")}`,metadata:[{label:"CPU",value:`${finite(item.cpu)??"?"}%`},{label:"Memória",value:`${finite(item.mem)??"?"}%`}]})):undefined,"Processos");
export const dailySummaryAdapter=genericAdapter(data=>{if(!data||typeof data!=="object")return;const row=data as any;return[{kind:"generic",title:"Resumo local",metadata:[{label:"Memória em uso",value:`${finite(row.memory?.usedGB)??"?"} GB`},{label:"Memória disponível",value:`${finite(row.memory?.availableGB)??"?"} GB`},{label:"Disco mais ocupado",value:row.disk?`${String(row.disk.mount)} — ${finite(row.disk.use)??"?"}%`:"Sem dados"},{label:"Processos observados",value:String(Array.isArray(row.processes)?row.processes.length:0)}]}];},"Resumo do computador");
