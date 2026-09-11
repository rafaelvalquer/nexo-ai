import { randomUUID } from "node:crypto";
import { NexoDatabase } from "../database/db.js";
import { Memory, MemoryCategory } from "./memory.types.js";

export class MemoryRepository {
  constructor(private db: NexoDatabase) {}

  save(memory: Memory): void {
    const existing = this.findByKey(memory.key);
    if (existing) {
      this.db.run(
        "UPDATE memories SET value=?, category=?, source=?, confidence=?, updated_at=? WHERE key=?",
        [memory.value, memory.category, memory.source, memory.confidence, new Date().toISOString(), memory.key]
      );
    } else {
      this.db.run(
        "INSERT INTO memories (id, key, value, category, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [memory.id, memory.key, memory.value, memory.category, memory.source, memory.confidence, memory.createdAt, memory.updatedAt]
      );
    }
  }

  findByKey(key: string): Memory | undefined {
    return this.db.get<any>("SELECT * FROM memories WHERE key=?", [key]);
  }

  search(query: string): Memory[] {
    const likeQuery = `%${query}%`;
    return this.db.all<any>("SELECT * FROM memories WHERE key LIKE ? OR value LIKE ?", [likeQuery, likeQuery]);
  }

  listByCategory(): Record<string, Memory[]> {
    const all = this.db.all<any>("SELECT * FROM memories ORDER BY category, key");
    const result: Record<string, Memory[]> = {};
    for (const row of all) {
      if (!result[row.category]) result[row.category] = [];
      result[row.category].push({
        id: row.id,
        key: row.key,
        value: row.value,
        category: row.category as MemoryCategory,
        source: row.source,
        confidence: row.confidence,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }
    return result;
  }

  remove(key: string): void {
    this.db.run("DELETE FROM memories WHERE key=?", [key]);
  }
}
