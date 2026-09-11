import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import archiver from "archiver";
import trash from "trash";
import AdmZip from "adm-zip";
import { createWriteStream } from "node:fs";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";

export function filesystemTools(): ToolDefinition[] {
  return [
    {
      name: "list_files", description: "Lista arquivos de uma pasta", risk: "READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema: z.object({ path: z.string() }),
      async execute({path:p}) { const names = await fs.readdir(p, { withFileTypes:true }); return { ok:true, summary:`${names.length} itens encontrados`, data:names.map(x=>({name:x.name,type:x.isDirectory()?"directory":"file",path:path.join(p,x.name)})) }; }
    },
    {
      name: "search_files", description: "Pesquisa arquivos por nome", risk: "READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema: z.object({ path:z.string(), query:z.string(), maxDepth:z.number().int().min(0).max(8).default(4) }),
      async execute({path:base,query,maxDepth}) { const out:any[]=[]; const walk=async(dir:string,depth:number)=>{if(depth>maxDepth||out.length>=300)return; for(const e of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){ const full=path.join(dir,e.name); if(e.name.toLowerCase().includes(query.toLowerCase())) out.push({name:e.name,path:full,type:e.isDirectory()?"directory":"file"}); if(e.isDirectory()) await walk(full,depth+1); }}; await walk(base,0); return {ok:true,summary:`${out.length} resultado(s)`,data:out}; }
    },
    {
      name:"read_file", description:"Lê arquivo texto", risk:"READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema:z.object({path:z.string(),maxChars:z.number().int().min(100).max(200000).default(30000)}),
      async execute({path:p,maxChars}) { const text=await fs.readFile(p,"utf8"); return {ok:true,summary:`Arquivo lido (${Math.min(text.length,maxChars)} caracteres)`,data:text.slice(0,maxChars)}; }
    },
    {
      name:"file_info", description:"Obtém metadados de arquivo", risk:"READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:p}){const s=await fs.stat(p);return {ok:true,summary:"Metadados obtidos",data:{size:s.size,createdAt:s.birthtime.toISOString(),modifiedAt:s.mtime.toISOString(),isDirectory:s.isDirectory()}};}
    },
    {
      name:"create_folder", description:"Cria diretório", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:p}){await fs.mkdir(p,{recursive:true});return {ok:true,summary:`Pasta criada: ${p}`};}
    },
    {
      name:"copy_file", description:"Copia arquivo", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],
      inputSchema:z.object({source:z.string(),destination:z.string()}), async execute({source,destination}){await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(source,destination);return {ok:true,summary:`Copiado para ${destination}`};}
    },
    {
      name:"move_file", description:"Move arquivo", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],
      inputSchema:z.object({source:z.string(),destination:z.string()}), async execute({source,destination}){await fs.mkdir(path.dirname(destination),{recursive:true});await fs.rename(source,destination);return {ok:true,summary:`Movido para ${destination}`};}
    },
    {
      name:"rename_file", description:"Renomeia arquivo", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["path","newPath"],
      inputSchema:z.object({path:z.string(),newPath:z.string()}), async execute({path:p,newPath}){await fs.rename(p,newPath);return {ok:true,summary:`Renomeado para ${newPath}`};}
    },
    {
      name:"calculate_hash", description:"Calcula SHA-256", risk:"READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:p}){const b=await fs.readFile(p);const hash=crypto.createHash("sha256").update(b).digest("hex");return {ok:true,summary:"SHA-256 calculado",data:{sha256:hash}};}
    },
    {
      name:"trash_file", description:"Move arquivo ou pasta para a lixeira do sistema", risk:"CRITICAL", permissions:["filesystem.write"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:p}){await trash([p]);return {ok:true,summary:`Enviado para a lixeira: ${p}`};}
    },
    {
      name:"compress_files", description:"Cria arquivo ZIP", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["destination", "sources"],
      inputSchema:z.object({sources:z.array(z.string()).min(1),destination:z.string()}),
      async execute({sources,destination}) { await fs.mkdir(path.dirname(destination),{recursive:true}); await new Promise<void>((resolve,reject)=>{ const output=createWriteStream(destination); const zip=archiver("zip",{zlib:{level:9}}); output.on("close",()=>resolve()); zip.on("error",reject); zip.pipe(output); for(const s of sources){ zip.file(s,{name:path.basename(s)}); } void zip.finalize(); }); return {ok:true,summary:`ZIP criado: ${destination}`}; }
    },
    {
      name:"extract_archive", description:"Extrai um ZIP para uma pasta", risk:"SAFE_WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],
      inputSchema:z.object({source:z.string(),destination:z.string()}),
      async execute({source,destination}){
        const base=path.resolve(destination);await fs.mkdir(base,{recursive:true});const zip=new AdmZip(source);
        for(const entry of zip.getEntries()){const target=path.resolve(base,entry.entryName);if(target!==base&&!target.startsWith(base+path.sep))throw new Error(`Entrada ZIP insegura: ${entry.entryName}`);if(entry.isDirectory){await fs.mkdir(target,{recursive:true});}else{await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,entry.getData());}}
        return {ok:true,summary:`Arquivo extraído em ${destination}`};}
    }
  ];
}
