import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import archiver from "archiver";
import trash from "trash";
import AdmZip from "adm-zip";
import { createWriteStream } from "node:fs";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { textFileTools } from "./text-file-tools.js";
import { PhysicalFileSearch } from "../../filesystem/physical-file-search.js";
import { WorkspaceFileRepository } from "../../filesystem/workspace-file-repository.js";
import { normalizeFilename } from "../../filesystem/filename-normalizer.js";
import type { NexoDatabase } from "../../database/db.js";
import type { PermissionEngine } from "../../permissions/policy.js";
import { WorkspaceIndexer } from "../../filesystem/workspace-indexer.js";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}

export function filesystemTools(options: { roots?:()=>string[]; permissions?:PermissionEngine; database?:NexoDatabase; onSearchProgress?:(event:{query:string;scannedEntries:number;scannedDirectories:number;matches:number;currentRoot:string})=>void; metric?:(name:string,value:number)=>void } = {}): ToolDefinition[] {
  const physicalSearch = new PhysicalFileSearch();
  const index = options.database ? new WorkspaceFileRepository(options.database) : undefined;
  const indexer = index ? new WorkspaceIndexer(index) : undefined;
  if(indexer&&options.roots){void indexer.indexRoots(options.roots()).catch(()=>undefined);const timer=setInterval(()=>{if(!indexer.getStatus().running)void indexer.indexRoots(options.roots!()).catch(()=>undefined);},30*60_000);timer.unref?.();}
  return [
    ...textFileTools(),
    {
      name:"find_file",description:"Localiza um arquivo pelo nome exato nas pastas atualmente autorizadas",domain:"filesystem",operation:"find_file",risk:"READ",permissions:["filesystem.read"],
      inputSchema:z.object({fileName:z.string().trim().min(1).max(260),root:z.string().optional(),mode:z.enum(["exact","case_insensitive"]).default("case_insensitive"),maxResults:z.number().int().min(1).max(50).default(20)}),
      async execute({fileName,root,mode,maxResults},context){
        const roots=context?.filesystemRoots??options.roots?.()??[]; const candidates=root?[root]:roots;
        const assertPath=context?.assertFilesystemPath??(options.permissions?(candidate:string)=>options.permissions!.assertPath(candidate):undefined);
        if(root){if(!assertPath)throw new Error("A pasta precisa ser verificada pelo PermissionEngine.");assertPath(root);}
        if(!candidates.length)return{ok:false,summary:"Não há pastas autorizadas para pesquisar. Adicione uma pasta em Configurações → Segurança → Pastas permitidas."};
        const normalized=normalizeFilename(fileName),started=Date.now(); let indexState="MISS";
        if(index&&!root){
          const cached=index.findExact(normalized,roots),valid=[] as Array<{name:string;path:string;root:string;size:number;modifiedAt:string}>;
          for(const row of cached){context?.signal?.throwIfAborted();try{assertPath?.(row.path);const stat=await fs.stat(row.path);if(!stat.isFile()){index.delete(row.path);continue;}valid.push({name:row.name,path:row.path,root:row.root,size:stat.size,modifiedAt:stat.mtime.toISOString()});}catch{index.delete(row.path);}}
          const selected=mode==="exact"?valid.filter(row=>row.name.normalize("NFKC")===fileName.normalize("NFKC")):valid;
          if(selected.length){options.metric?.("filesystem.find.index_hit",1);options.metric?.("filesystem.find.duration_ms",Date.now()-started);return{ok:true,summary:`${selected.length} arquivo(s) encontrado(s) pelo índice.`,data:{source:"workspace_index",matches:selected.slice(0,maxResults),searchedRoots:roots,scannedEntries:0,elapsedMs:Date.now()-started,truncated:selected.length>maxResults}};}
          indexState="MISS";
        }
        options.metric?.("filesystem.find.index_miss",1);
        const result=await physicalSearch.find({roots:candidates,query:fileName,mode:mode==="exact"?"exact":"case_insensitive",maxResults,onProgress:event=>options.onSearchProgress?.({query:fileName,...event})},context?.signal,candidate=>assertPath?.(candidate));
        for(const match of result.matches){assertPath?.(match.path);if(index){index.upsert({id:match.path,root:match.root,path:match.path,parentPath:path.dirname(match.path),name:match.name,nameNormalized:normalized,extension:path.extname(match.name)||undefined,size:match.size,modifiedAt:match.modifiedAt,indexedAt:new Date().toISOString()});}}
        const metricName=result.matches.length>1?"filesystem.find.multiple_matches":result.matches.length?"filesystem.find.physical_hit":"filesystem.find.not_found";options.metric?.(metricName,1);options.metric?.("filesystem.find.scanned_entries",result.scannedEntries);options.metric?.("filesystem.find.duration_ms",Date.now()-started);
        const summary=result.matches.length?`${result.matches.length} arquivo(s) encontrado(s).${result.truncated?" A busca foi limitada; pode haver outros resultados.":""}`:`Não encontrei ${fileName}. Pesquisei em: ${candidates.join(", ")}. ${result.scannedEntries} itens verificados.${result.truncated?" A pesquisa foi limitada por segurança/tempo.":""}`;
        return{ok:true,summary,data:{source:"physical_search",matches:result.matches,searchedRoots:candidates,scannedEntries:result.scannedEntries,scannedDirectories:result.scannedDirectories,elapsedMs:result.elapsedMs,truncated:result.truncated,reason:result.reason,index:indexState}};
      }
    },
    ...(indexer?[{name:"refresh_workspace_index",description:"Atualiza o índice local de nomes e metadados das pastas autorizadas",domain:"filesystem",operation:"refresh_index",risk:"READ" as const,permissions:["filesystem.read"],inputSchema:z.object({}),async execute(_input:any,context:any){const roots=context?.filesystemRoots??options.roots?.()??[];const status=await indexer.indexRoots(roots,context?.signal);return{ok:true,summary:`Índice atualizado: ${status.indexed} arquivo(s) atualizado(s), ${status.scanned} itens verificados.`,data:status};}}]:[]),
    {
      name: "list_files", description: "Lista arquivos de uma pasta", risk: "READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema: z.object({
        path: z.string(),
        kind: z.enum(["all", "file", "directory"]).default("all"),
        sortBy: z.enum(["name", "modifiedAt", "size"]).default("name"),
        sortDirection: z.enum(["asc", "desc"]).default("asc"),
        limit: z.number().int().min(1).max(100).default(100)
      }),
      async execute({path:p,kind,sortBy,sortDirection,limit}) {
        const names = await fs.readdir(p, { withFileTypes:true });
        const entries: Array<{name:string;type:"directory"|"file";path:string;size?:number;modifiedAt?:string;childCount?:number}> = [];
        for(let offset=0;offset<names.length;offset+=32) entries.push(...await Promise.all(names.slice(offset,offset+32).map(async entry=>{
          const full=path.join(p,entry.name),stat=await fs.lstat(full).catch(()=>undefined);
          return {name:entry.name,type:entry.isDirectory()?("directory" as const):("file" as const),path:full,size:entry.isFile()?stat?.size:undefined,modifiedAt:stat?.mtime.toISOString(),childCount:entry.isDirectory()?(await fs.readdir(full).catch(()=>[])).length:undefined};
        })));
        const filtered=kind==="all"?entries:entries.filter(entry=>entry.type===kind);
        const direction=sortDirection==="desc"?-1:1;
        const rows=filtered.sort((a,b)=>{
          if(sortBy==="modifiedAt")return ((Date.parse(a.modifiedAt??"")||0)-(Date.parse(b.modifiedAt??"")||0))*direction||a.name.localeCompare(b.name);
          if(sortBy==="size")return ((a.size??0)-(b.size??0))*direction||a.name.localeCompare(b.name);
          return a.name.localeCompare(b.name)*direction;
        });
        const visible = rows.slice(0,limit);
        const lines = visible.map(row => `${row.type === "directory" ? "[Pasta]" : "[Arquivo]"} ${row.name}`);
        const suffix = rows.length > visible.length ? `\n… e mais ${rows.length - visible.length} item(ns).` : "";
        return { ok:true, summary:`${visible.length} de ${rows.length} item(ns) encontrados em ${p}.\n${lines.join("\n")}${suffix}`, data:visible };
      }
    },
    {
      name: "largest_files", description: "Analisa uma pasta e retorna os maiores arquivos por tamanho", risk: "READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema: z.object({ path:z.string(), limit:z.number().int().min(1).max(50).default(15), maxDepth:z.number().int().min(0).max(8).default(4) }),
      async execute({path:base,limit,maxDepth}) {
        const files: Array<{name:string;path:string;size:number}> = [];
        let scanned = 0;
        const walk = async (dir:string, depth:number): Promise<void> => {
          if (depth > maxDepth || scanned >= 20000) return;
          const entries = await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]);
          for (const entry of entries) {
            if (scanned >= 20000) break;
            const full = path.join(dir,entry.name);
            if (entry.isDirectory()) {
              await walk(full,depth+1);
              continue;
            }
            if (!entry.isFile()) continue;
            scanned++;
            const stat = await fs.stat(full).catch(()=>null);
            if (stat) files.push({name:entry.name,path:full,size:stat.size});
          }
        };
        await walk(base,0);
        const top = files.sort((a,b)=>b.size-a.size).slice(0,limit);
        const totalBytes = files.reduce((sum,file)=>sum+file.size,0);
        const lines = top.length
          ? top.map((file,index)=>`${index+1}. ${file.name} — ${formatBytes(file.size)}\n   ${file.path}`)
          : ["Nenhum arquivo encontrado."];
        return {
          ok:true,
          summary:`Análise concluída em ${base}. ${files.length} arquivo(s) analisado(s), ${formatBytes(totalBytes)} no total.\n\nMaiores arquivos:\n${lines.join("\n")}`,
          data:{base,scanned:files.length,totalBytes,files:top}
        };
      }
    },
    {
      name: "search_files", description: "Pesquisa arquivos por termo ou extensão nas pastas permitidas", risk: "READ", permissions:["filesystem.read"], pathFields:["path","paths"],
      inputSchema: z.object({ path:z.string().optional(), paths:z.array(z.string()).min(1).max(32).optional(), query:z.string().trim().min(1).max(260), maxDepth:z.number().int().min(0).max(8).default(4) }),
      async execute({path:base,paths,query,maxDepth},context) {
        const roots:string[]=[...new Set<string>((paths as string[]|undefined)??(base?[String(base)]:context?.filesystemRoots??options.roots?.()??[]))];
        if(!roots.length)return{ok:false,summary:"Não há pastas autorizadas para pesquisar. Adicione uma pasta em Configurações → Segurança → Pastas permitidas."};
        const result=await physicalSearch.find({roots,query,mode:query.startsWith(".")?"extension":"contains",maxDepth,maxEntries:20_000,maxResults:100,maxDurationMs:15_000},context?.signal,target=>context?.assertFilesystemPath?.(target));
        return {ok:true,summary:result.matches.length?`${result.matches.length} resultado(s) encontrado(s).${result.truncated?" A busca foi limitada.":""}`:`Nenhum arquivo encontrado em ${roots.join(", ")}. ${result.scannedEntries} itens verificados.`,data:{...result,searchedRoots:roots}};
      }
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
      name:"create_folder", description:"Cria diretório", risk:"WRITE", permissions:["filesystem.write"], pathFields:["path"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({path:z.string()}), async execute({path:p}){await fs.mkdir(p,{recursive:true});return {ok:true,summary:`Pasta criada: ${p}`};}
    },
    {
      name:"copy_file", description:"Copia arquivo", risk:"WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({source:z.string(),destination:z.string()}), async execute({source,destination}){await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(source,destination);return {ok:true,summary:`Copiado para ${destination}`};}
    },
    {
      name:"move_file", description:"Move arquivo", risk:"WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({source:z.string(),destination:z.string()}), async execute({source,destination}){await fs.mkdir(path.dirname(destination),{recursive:true});await fs.rename(source,destination);return {ok:true,summary:`Movido para ${destination}`};}
    },
    {
      name:"rename_file", description:"Renomeia arquivo", risk:"WRITE", permissions:["filesystem.write"], pathFields:["path","newPath"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({path:z.string(),newPath:z.string()}), async execute({path:p,newPath}){await fs.rename(p,newPath);return {ok:true,summary:`Renomeado para ${newPath}`};}
    },
    {
      name:"calculate_hash", description:"Calcula SHA-256", risk:"READ", permissions:["filesystem.read"], pathFields:["path"],
      inputSchema:z.object({path:z.string()}), async execute({path:p}){const b=await fs.readFile(p);const hash=crypto.createHash("sha256").update(b).digest("hex");return {ok:true,summary:"SHA-256 calculado",data:{sha256:hash}};}
    },
    {
      name:"trash_file", description:"Move arquivo ou pasta para a lixeira do sistema", risk:"CRITICAL", permissions:["filesystem.write"], pathFields:["path"],mutationSafety:{idempotency:"none",reconciliation:"not_supported"},
      inputSchema:z.object({path:z.string()}), async execute({path:p}){await trash([p]);return {ok:true,summary:`Enviado para a lixeira: ${p}`};}
    },
    {
      name:"compress_files", description:"Cria arquivo ZIP", risk:"WRITE", permissions:["filesystem.write"], pathFields:["destination", "sources"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({sources:z.array(z.string()).min(1),destination:z.string()}),
      async execute({sources,destination}) { await fs.mkdir(path.dirname(destination),{recursive:true}); await new Promise<void>((resolve,reject)=>{ const output=createWriteStream(destination); const zip=archiver("zip",{zlib:{level:9}}); output.on("close",()=>resolve()); zip.on("error",reject); zip.pipe(output); for(const s of sources){ zip.file(s,{name:path.basename(s)}); } void zip.finalize(); }); return {ok:true,summary:`ZIP criado: ${destination}`}; }
    },
    {
      name:"extract_archive", description:"Extrai um ZIP para uma pasta", risk:"WRITE", permissions:["filesystem.write"], pathFields:["source","destination"],mutationSafety:{idempotency:"nexo",reconciliation:"supported"},
      inputSchema:z.object({source:z.string(),destination:z.string()}),
      async execute({source,destination}){
        const base=path.resolve(destination);await fs.mkdir(base,{recursive:true});const zip=new AdmZip(source);
        for(const entry of zip.getEntries()){const target=path.resolve(base,entry.entryName);if(target!==base&&!target.startsWith(base+path.sep))throw new Error(`Entrada ZIP insegura: ${entry.entryName}`);if(entry.isDirectory){await fs.mkdir(target,{recursive:true});}else{await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,entry.getData());}}
        return {ok:true,summary:`Arquivo extraído em ${destination}`};}
    }
  ];
}
