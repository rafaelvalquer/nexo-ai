import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceFile, WorkspaceFileRepository } from "./workspace-file-repository.js";
import { normalizeFilename } from "./filename-normalizer.js";

export type WorkspaceIndexStatus = { running: boolean; scanned: number; indexed: number; currentRoot?: string; lastCompletedAt?: string; error?: string };

export class WorkspaceIndexer {
  private status: WorkspaceIndexStatus = { running: false, scanned: 0, indexed: 0 };
  constructor(private readonly repository: WorkspaceFileRepository) {}
  getStatus() { return { ...this.status }; }
  async indexRoots(roots: string[], signal?: AbortSignal, onProgress?: (status: WorkspaceIndexStatus) => void) {
    if (this.status.running) return this.getStatus();
    this.status = { running: true, scanned: 0, indexed: 0 };
    try {
      for (const root of [...new Set(roots.map(value => path.resolve(value)))]) {
        signal?.throwIfAborted(); this.status.currentRoot = root;
        const seen = new Set<string>(), queue=[{ directory: root, depth: 0 }];
        while(queue.length) {
          signal?.throwIfAborted(); const current=queue.shift()!;
          const entries=await fs.readdir(current.directory,{withFileTypes:true}).catch(()=>[]);
          signal?.throwIfAborted(); entries.sort((a,b)=>a.name.localeCompare(b.name));
          for(const entry of entries) {
            signal?.throwIfAborted(); this.status.scanned++;
            if(entry.isSymbolicLink())continue;
            const filePath=path.join(current.directory,entry.name);
            if(entry.isDirectory()) { if(current.depth<12)queue.push({directory:filePath,depth:current.depth+1}); continue; }
            if(!entry.isFile())continue;
            seen.add(filePath);
            const stat=await fs.stat(filePath).catch(()=>undefined); if(!stat)continue;
            const previous=this.repository.findExact(entry.name,[root]).find(item=>item.path===filePath);
            if(previous&&previous.size===stat.size&&previous.modifiedAt===stat.mtime.toISOString())continue;
            const extension=path.extname(entry.name)||undefined;
            const file: WorkspaceFile={id:previous?.id??randomUUID(),root,path:filePath,parentPath:current.directory,name:entry.name,nameNormalized:normalizeFilename(entry.name),stemNormalized:normalizeFilename(path.parse(entry.name).name),extension,size:stat.size,modifiedAt:stat.mtime.toISOString(),indexedAt:new Date().toISOString()};
            this.repository.upsert(file);this.status.indexed++;
          }
          onProgress?.(this.getStatus());
        }
        for(const cached of this.repository.byRoot(root))if(!seen.has(cached.path))this.repository.delete(cached.path);
      }
      this.status.lastCompletedAt=new Date().toISOString();
    } catch(error) { if(!signal?.aborted)this.status.error=error instanceof Error?error.message:String(error); else throw error; }
    finally { this.status.running=false; this.status.currentRoot=undefined; }
    return this.getStatus();
  }
}
