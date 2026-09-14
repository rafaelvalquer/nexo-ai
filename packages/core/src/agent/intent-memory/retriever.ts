import type { AgentIntent, IntentDomain } from "../orchestrator/intent-schema.js";
import { IntentMemoryStore, normalizeUtterance, type StoredIntentExample } from "./store.js";

export type RetrievedIntentExample = { utterance: string; intent: AgentIntent; score: number; source: string };

export class IntentMemoryRetriever {
  constructor(
    private readonly store: IntentMemoryStore,
    private readonly embed?: (text: string) => Promise<number[]>
  ) {}

  async retrieve(utterance: string, domain?: IntentDomain, limit = 5): Promise<RetrievedIntentExample[]> {
    const candidates = this.store.candidates(domain, 150);
    if (!candidates.length) return [];
    const normalized = normalizeUtterance(utterance);
    let queryEmbedding: number[] | undefined;
    if (this.embed) {
      try {
        const vector = await this.embed(utterance);
        if (vector.length) queryEmbedding = vector;
      } catch {}
    }

    const ranked = candidates.map(example => ({
      example,
      score: combinedScore(normalized, queryEmbedding, example)
    })).filter(item => item.score > .12)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(5, limit)));

    this.store.touch(ranked.map(item => item.example.id));
    return ranked.map(({ example, score }) => ({
      utterance: example.utterance,
      score,
      source: example.source,
      intent: {
        schemaVersion: 1,
        status: "ready",
        domain: example.domain,
        intent: example.intent,
        operation: example.operation,
        entities: example.entities,
        referencesPreviousResult: false,
        requiresDataLookup: !["send", "create"].includes(example.intent),
        requiresConfirmation: ["create", "send", "update", "delete", "move"].includes(example.intent),
        confidence: Math.max(.7, example.confidence)
      }
    }));
  }
}

function combinedScore(query: string, queryEmbedding: number[] | undefined, example: StoredIntentExample) {
  const lexical = lexicalSimilarity(query, example.normalizedUtterance);
  const semantic = queryEmbedding?.length && example.embedding?.length === queryEmbedding.length
    ? cosine(queryEmbedding, example.embedding)
    : 0;
  const sourceBoost = example.source === "user_correction" ? .08 : example.source === "confirmed_execution" ? .04 : 0;
  return Math.min(1, (semantic > 0 ? semantic * .7 + lexical * .3 : lexical) + sourceBoost);
}

function lexicalSimilarity(a: string, b: string) {
  if (a === b) return 1;
  const left = new Set(tokens(a)), right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function tokens(value: string) {
  return value.split(/[^a-z0-9@._-]+/i).filter(token => token.length > 1);
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    na += a[index] * a[index];
    nb += b[index] * b[index];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
