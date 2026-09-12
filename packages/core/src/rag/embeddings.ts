/** Dedicated local embedding client. It intentionally never reuses the chat model. */
export class EmbeddingProvider {
  constructor(private baseUrl: string, private model: string) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/embeddings`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: text }), signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`Embeddings indisponíveis (HTTP ${response.status}).`);
    const payload = await response.json() as { embedding?: unknown };
    return Array.isArray(payload.embedding) && payload.embedding.every(value => typeof value === "number") ? payload.embedding : [];
  }
}
