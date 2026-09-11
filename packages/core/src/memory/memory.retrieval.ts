import { MemoryRepository } from "./memory.repository.js";

/**
 * Recupera memórias relevantes para um dado texto de entrada.
 * Evita enviar todo o banco para o LLM — só injeta o que é pertinente ao contexto.
 */
export class MemoryRetrieval {
  constructor(private repo: MemoryRepository) {}

  /**
   * Extrai tokens relevantes da query e busca memórias correspondentes.
   * Retorna até 5 memórias mais relevantes.
   */
  retrieve(query: string, maxResults = 5): Array<{ key: string; value: string }> {
    const tokens = query
      .toLowerCase()
      .replace(/[^a-záéíóúãõâêîôûàç\s]/gi, " ")
      .split(/\s+/)
      .filter(t => t.length > 3);

    const candidates = new Map<string, { key: string; value: string; score: number }>();

    for (const token of tokens) {
      const results = this.repo.search(token);
      for (const r of results) {
        const existing = candidates.get(r.key);
        if (existing) {
          existing.score++;
        } else {
          candidates.set(r.key, { key: r.key, value: r.value, score: 1 });
        }
      }
    }

    return [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ key, value }) => ({ key, value }));
  }

  /**
   * Formata as memórias relevantes como bloco de contexto para o LLM.
   */
  formatContext(query: string): string {
    const memories = this.retrieve(query);
    if (memories.length === 0) return "";
    const lines = memories.map(m => `${m.key}: ${m.value}`).join("\n");
    return `[Memória do usuário]\n${lines}\n`;
  }
}
