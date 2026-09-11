import os from "node:os";
import { z } from "zod";
import si from "systeminformation";
import type { ToolDefinition } from "../types.js";

export function systemTools(): ToolDefinition[] {
  return [
    {
      name:"system_info", description:"Informações de hardware e sistema", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const [cpu,mem,gpu,osInfo]=await Promise.all([si.cpu(),si.mem(),si.graphics(),si.osInfo()]);return {ok:true,summary:"Informações do sistema coletadas",data:{hostname:os.hostname(),platform:osInfo.platform,distro:osInfo.distro,cpu:cpu.brand,cores:cpu.cores,memoryGB:Math.round(mem.total/1024/1024/1024),gpu:gpu.controllers.map(x=>({model:x.model,vramMB:x.vram}))}};}
    },
    {
      name:"process_list", description:"Lista processos", risk:"READ", permissions:["system.read"], inputSchema:z.object({limit:z.number().int().min(1).max(100).default(25)}),
      async execute({limit}){const p=await si.processes();const rows=[...p.list].sort((a,b)=>b.cpu-a.cpu).slice(0,limit).map(x=>({pid:x.pid,name:x.name,cpu:x.cpu,mem:x.mem}));return {ok:true,summary:`Top ${rows.length} processos por CPU`,data:rows};}
    },
    {
      name:"disk_usage", description:"Uso dos discos", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const d=await si.fsSize();return {ok:true,summary:"Uso de disco coletado",data:d.map(x=>({fs:x.fs,mount:x.mount,sizeGB:Math.round(x.size/1e9),usedGB:Math.round(x.used/1e9),use:x.use}))};}
    },
    {
      name:"memory_usage", description:"Uso da memória", risk:"READ", permissions:["system.read"], inputSchema:z.object({}),
      async execute(){const m=await si.mem();return {ok:true,summary:"Uso de memória coletado",data:{totalGB:+(m.total/1e9).toFixed(1),usedGB:+(m.used/1e9).toFixed(1),availableGB:+(m.available/1e9).toFixed(1)}};}
    }
  ];
}
