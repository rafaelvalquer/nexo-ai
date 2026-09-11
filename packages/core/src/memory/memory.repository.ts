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
      return;
    }

    this.db.run(
      "INSERT INTO memories (id, key, value, category, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [memory.id, memory.key, memory.value, memory.category, memory.source, memory.confidence, memory.createdAt, memory.updatedAt]
    );
  }

  findByKey(key: string): Memory | undefined {
    const row = this.db.get<any>("SELECT * FROM memories WHERE key=?", [key]);
    return row ? this.toMemory(row) : undefined;
  }

  search(query: string): Memory[] {
    const likeQuery = `%${query}%`;
    return this.db
      .all<any>("SELECT * FROM memories WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC", [likeQuery, likeQuery])
      .map(row => this.toMemory(row));
  }

  listByCategory(): Record<string, Memory[]> {
    const all = this.db.all<any>("SELECT * FROM memories ORDER BY category, key");
    const result: Record<string, Memory[]> = {};
    for (const row of all) {
      const memory = this.toMemory(row);
      if (!result[memory.category]) result[memory.category] = [];
      result[memory.category].push(memory);
    }
    return result;
  }

  remove(key: string): void {
    this.db.run("DELETE FROM memories WHERE key=?", [key]);
  }

  clear(): void {
    this.db.run("DELETE FROM memories");
  }

  private toMemory(row: any): Memory {
    return {
      id: String(row.id),
      key: String(row.key),
      value: String(row.value),
      category: row.category as MemoryCategory,
      source: row.source ? String(row.source) : "user",
      confidence: Number(row.confidence ?? 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }
}
