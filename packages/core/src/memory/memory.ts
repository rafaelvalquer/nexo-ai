import { randomUUID } from "node:crypto";
import { NexoDatabase } from "../database/db.js";

export class MemoryService {
  constructor(private db: NexoDatabase) {}
  add(content: string) { const id=randomUUID(); const createdAt=new Date().toISOString(); this.db.run("INSERT INTO memories(id,content,created_at) VALUES(?,?,?)",[id,content,createdAt]); return {id,content,createdAt}; }
  list(limit=100) { return this.db.all<any>("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?",[limit]).map(r=>({id:r.id,content:r.content,createdAt:r.created_at})); }
  remove(id:string) { this.db.run("DELETE FROM memories WHERE id=?",[id]); }
}
