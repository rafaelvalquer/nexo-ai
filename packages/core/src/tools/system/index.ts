import os from "node:os";
import { z } from "zod";
import si from "systeminformation";
import type { ToolDefinition } from "../types.js";

function isIdleProcess(name: string) {
  return name.trim().toLowerCase() === "system idle process";
}

export function systemTools(): ToolDefinition[] {
  return [
    {
      name:"system_info", description:"Informações de hardware e sistema", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const [cpu,mem,gpu,osInfo]=await Promise.all([si.cpu(),si.mem(),si.graphics(),si.osInfo()]);return {ok:true,summary:"Informações do sistema coletadas",data:{hostname:os.hostname(),platform:osInfo.platform,distro:osInfo.distro,cpu:cpu.brand,cores:cpu.cores,memoryGB:Math.round(mem.total/1024/1024/1024),gpu:gpu.controllers.map(x=>({model:x.model,vramMB:x.vram}))}};}
    },
    {
      name:"process_list", description:"Lista os processos com maior uso de CPU ou memória", risk:"READ", permissions:["system.read"], inputSchema:z.object({limit:z.number().int().min(1).max(100).default(25),sortBy:z.enum(["cpu","memory"]).default("cpu")}),
      async execute({limit,sortBy}){const p=await si.processes();const rows=[...p.list].filter(x=>!isIdleProcess(x.name)).sort((a,b)=>sortBy==="memory"?b.mem-a.mem:b.cpu-a.cpu).slice(0,limit).map(x=>({pid:x.pid,name:x.name,cpu:x.cpu,mem:x.mem}));return {ok:true,summary:`Top ${rows.length} processos por ${sortBy==="memory"?"memória":"CPU"}`,data:rows};}
    },
    {
      name:"disk_usage", description:"Uso dos discos", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const d=await si.fsSize();return {ok:true,summary:"Uso de disco coletado",data:d.map(x=>({fs:x.fs,mount:x.mount,sizeGB:Math.round(x.size/1e9),usedGB:Math.round(x.used/1e9),use:x.use}))};}
    },
    {
      name:"memory_usage", description:"Uso da memória", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const m=await si.mem();return {ok:true,summary:"Uso de memória coletado",data:{totalGB:+(m.total/1e9).toFixed(1),usedGB:+(m.used/1e9).toFixed(1),availableGB:+(m.available/1e9).toFixed(1)}};}
    },
    {
      name:"daily_summary", description:"Gera um resumo local rápido do computador para o dia", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){
        const [memory,disks,processes]=await Promise.all([si.mem(),si.fsSize(),si.processes()]);
        const totalGB=+(memory.total/1e9).toFixed(1);
        const usedGB=+(memory.used/1e9).toFixed(1);
        const availableGB=+(memory.available/1e9).toFixed(1);
        const worst=[...disks].sort((a,b)=>b.use-a.use)[0];
        const top=[...processes.list].filter(p=>!isIdleProcess(p.name)).sort((a,b)=>b.cpu-a.cpu).slice(0,3);
        const lines=[
          "Resumo diário local:",
          `• Memória: ${usedGB} GB usados de ${totalGB} GB (${availableGB} GB disponíveis).`,
          worst ? `• Disco mais ocupado: ${worst.mount || worst.fs} em ${worst.use.toFixed(1)}%.` : "• Disco: sem dados disponíveis.",
          top.length ? `• Processos com maior CPU: ${top.map(p=>`${p.name} (${Number(p.cpu).toFixed(1)}%)`).join(", ")}.` : "• Processos: sem dados disponíveis.",
          "• Gmail e Calendário não entram neste resumo enquanto não houver conexões configuradas."
        ];
        return {ok:true,summary:lines.join("\n"),data:{memory:{totalGB,usedGB,availableGB},disk:worst?{mount:worst.mount||worst.fs,use:worst.use}:null,processes:top.map(p=>({name:p.name,cpu:p.cpu}))}};
      }
    }
  ];
}
