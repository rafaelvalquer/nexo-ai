import type { NexoDatabase } from "../database/db.js";
import { normalizeFilename } from "./filename-normalizer.js";

export type WorkspaceFile = { id: string; root: string; path: string; parentPath: string; name: string; nameNormalized: string; stemNormalized?: string; extension?: string; size: number; modifiedAt: string; indexedAt: string };

export class WorkspaceFileRepository {
  constructor(private readonly db: NexoDatabase) {
    db.run(`CREATE TABLE IF NOT EXISTS workspace_files(id TEXT PRIMARY KEY,root TEXT NOT NULL,path TEXT NOT NULL UNIQUE,parent_path TEXT NOT NULL,name TEXT NOT NULL,name_normalized TEXT NOT NULL,extension TEXT,size INTEGER,modified_at TEXT,indexed_at TEXT NOT NULL)`);
    try { db.run("ALTER TABLE workspace_files ADD COLUMN stem_normalized TEXT"); } catch { /* already migrated */ }
    const missingStems=db.all<{path:string;name:string;extension:string|null}>("SELECT path,name,extension FROM workspace_files WHERE stem_normalized IS NULL");
    for(const row of missingStems){const stem=row.extension?row.name.slice(0,-row.extension.length):row.name;db.run("UPDATE workspace_files SET stem_normalized=? WHERE path=?",[normalizeFilename(stem),row.path]);}
    db.run("CREATE INDEX IF NOT EXISTS idx_workspace_files_name ON workspace_files(name_normalized)");
    db.run("CREATE INDEX IF NOT EXISTS idx_workspace_files_stem ON workspace_files(stem_normalized)");
    db.run("CREATE INDEX IF NOT EXISTS idx_workspace_files_root ON workspace_files(root)");
    db.run("CREATE INDEX IF NOT EXISTS idx_workspace_files_modified ON workspace_files(modified_at)");
  }
  upsert(file: WorkspaceFile) { const extension=file.extension??"";const stem=extension?file.name.slice(0,-extension.length):file.name;this.db.run("INSERT INTO workspace_files(id,root,path,parent_path,name,name_normalized,stem_normalized,extension,size,modified_at,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET root=excluded.root,parent_path=excluded.parent_path,name=excluded.name,name_normalized=excluded.name_normalized,stem_normalized=excluded.stem_normalized,extension=excluded.extension,size=excluded.size,modified_at=excluded.modified_at,indexed_at=excluded.indexed_at", [file.id,file.root,file.path,file.parentPath,file.name,normalizeFilename(file.name),normalizeFilename(stem),file.extension??null,file.size,file.modifiedAt,file.indexedAt]); }
  delete(filePath: string) { this.db.run("DELETE FROM workspace_files WHERE path=?", [filePath]); }
  findExact(normalizedName: string, roots: string[]) { if (!roots.length) return []; const rows=this.db.all<any>(`SELECT * FROM workspace_files WHERE name_normalized=? AND root IN (${roots.map(()=>"?").join(",")}) ORDER BY root,path`,[normalizeFilename(normalizedName),...roots]); return rows.map((r:any)=>({id:r.id,root:r.root,path:r.path,parentPath:r.parent_path,name:r.name,nameNormalized:r.name_normalized,extension:r.extension??undefined,size:r.size,modifiedAt:r.modified_at,indexedAt:r.indexed_at} satisfies WorkspaceFile)); }
  findByStem(normalizedStem: string, roots: string[]) { if (!roots.length) return []; const rows=this.db.all<any>(`SELECT * FROM workspace_files WHERE stem_normalized=? AND root IN (${roots.map(()=>"?").join(",")}) ORDER BY root,extension,path`,[normalizeFilename(normalizedStem),...roots]); return rows.map((r:any)=>({id:r.id,root:r.root,path:r.path,parentPath:r.parent_path,name:r.name,nameNormalized:r.name_normalized,stemNormalized:r.stem_normalized,extension:r.extension??undefined,size:r.size,modifiedAt:r.modified_at,indexedAt:r.indexed_at} satisfies WorkspaceFile)); }
  removeRoot(root: string) { this.db.run("DELETE FROM workspace_files WHERE root=?", [root]); }
  clear() { this.db.run("DELETE FROM workspace_files"); }
  byRoot(root: string) { return this.db.all<WorkspaceFile>("SELECT id,root,path,parent_path AS parentPath,name,name_normalized AS nameNormalized,stem_normalized AS stemNormalized,extension,size,modified_at AS modifiedAt,indexed_at AS indexedAt FROM workspace_files WHERE root=?",[root]); }
}
