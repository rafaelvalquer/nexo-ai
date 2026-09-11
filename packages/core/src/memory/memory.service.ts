import { randomUUID } from "node:crypto";
import { MemoryRepository } from "./memory.repository.js";
import { MemoryNormalizer, SensitiveMemoryDetector } from "./memory.normalizer.js";
import { MemoryCategory, Memory } from "./memory.types.js";

export class MemoryService {
  constructor(private repo: MemoryRepository) {}

  save(key: string, value: string, category: string = "other"): Memory {
    if (SensitiveMemoryDetector.isSensitive(value)) {
      throw new Error("Não armazeno senhas ou dados sensíveis na memória do Nexo. Use um gerenciador de senhas para esse tipo de informação.");
    }
    
    const normalizedKey = MemoryNormalizer.normalizeKey(key);
    
    const memory: Memory = {
      id: randomUUID(),
      key: normalizedKey,
      value: value.trim(),
      category: category as MemoryCategory,
      source: "user",
      confidence: 1.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.repo.save(memory);
    return memory;
  }

  search(query: string): Memory[] {
    return this.repo.search(query);
  }

  listByCategory(): Record<string, Memory[]> {
    return this.repo.listByCategory();
  }

  remove(key: string): void {
    const normalizedKey = MemoryNormalizer.normalizeKey(key);
    this.repo.remove(normalizedKey);
  }
}
