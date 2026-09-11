import { randomUUID } from "node:crypto";
import { MemoryRepository } from "./memory.repository.js";
import { MemoryNormalizer, SensitiveMemoryDetector } from "./memory.normalizer.js";
import { MemoryCategory, Memory } from "./memory.types.js";

const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "profile",
  "preference",
  "project",
  "location",
  "application",
  "workflow",
  "other"
]);

export class MemoryService {
  constructor(
    private repo: MemoryRepository,
    private isEnabled: () => boolean = () => true
  ) {}

  save(key: string, value: string, category: string = "other"): Memory {
    this.assertEnabled();
    const normalizedKey = MemoryNormalizer.normalizeKey(key);
    const normalizedValue = value.trim();

    if (!normalizedKey) throw new Error("A chave da memória não pode estar vazia.");
    if (!normalizedValue) throw new Error("O valor da memória não pode estar vazio.");
    if (SensitiveMemoryDetector.isSensitive(normalizedValue)) {
      throw new Error("Não armazeno senhas ou dados sensíveis na memória do Nexo. Use um gerenciador de senhas para esse tipo de informação.");
    }

    const normalizedCategory = MEMORY_CATEGORIES.has(category as MemoryCategory)
      ? category as MemoryCategory
      : "other";

    const now = new Date().toISOString();
    const memory: Memory = {
      id: randomUUID(),
      key: normalizedKey,
      value: normalizedValue,
      category: normalizedCategory,
      source: "user",
      confidence: 1.0,
      createdAt: now,
      updatedAt: now
    };

    this.repo.save(memory);
    return memory;
  }

  search(query: string): Memory[] {
    if (!this.isEnabled()) return [];
    return this.repo.search(query.trim());
  }

  listByCategory(): Record<string, Memory[]> {
    if (!this.isEnabled()) return {};
    return this.repo.listByCategory();
  }

  remove(key: string): void {
    this.assertEnabled();
    const normalizedKey = MemoryNormalizer.normalizeKey(key);
    if (!normalizedKey) throw new Error("A chave da memória não pode estar vazia.");
    this.repo.remove(normalizedKey);
  }

  clear(): void {
    this.assertEnabled();
    this.repo.clear();
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new Error("A memória do Nexo está desativada nas Configurações ou o modo privado está ativo.");
    }
  }
}
