import type { AgentIntent, IntentDomain } from "../orchestrator/intent-schema.js";
import { IntentMemoryStore, normalizeUtterance, type StoredIntentExample } from "./store.js";

export type RetrievedIntentExample = { utterance: string; intent: AgentIntent; score: number; source: string; verifiedSuccessCount:number; failureCount:number };

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
      score: combinedScore(normalized, queryEmbedding, example,domain,inferOperationFamily(normalized))
    })).filter(item => item.score > .12)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(5, limit)));

    this.store.touch(ranked.map(item => item.example.id));
    return ranked.map(({ example, score }) => ({
      utterance: example.utterance,
      score,
      source: example.source,
      verifiedSuccessCount:example.successCount,
      failureCount:example.failureCount,
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

function combinedScore(query: string, queryEmbedding: number[] | undefined, example: StoredIntentExample,domain?:IntentDomain,queryFamily?:string) {
  const lexical = lexicalSimilarity(query, example.normalizedUtterance);
  const semantic = queryEmbedding?.length && example.embedding?.length === queryEmbedding.length ? Math.max(0,cosine(queryEmbedding, example.embedding)) : lexical;
  const domainMatch=domain?Number(example.domain===domain):.5;
  const sourceTrust=example.source==="user_correction"?1:example.source==="confirmed_execution"?0.9:0.7;
  const successEvidence=Math.min(1,example.successCount/3);
  const operationFamilyMatch=queryFamily?Number(operationFamily(example.operation)===queryFamily):.5;
  const recency=recencyScore(example.lastVerifiedAt??example.createdAt);
  const failurePenalty=Math.min(.45,example.failureCount*.12);
  return Math.max(0,Math.min(1,semantic*.42+lexical*.18+domainMatch*.10+operationFamilyMatch*.08+sourceTrust*.10+successEvidence*.08+recency*.04-failurePenalty));
}

function recencyScore(value:string){const time=Date.parse(value);if(!Number.isFinite(time))return .3;const days=Math.max(0,(Date.now()-time)/86_400_000);return days<=7?1:days<=30?0.8:days<=90?0.6:days<=180?0.4:0.2;}
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

function inferOperationFamily(value:string){
  if(/\b(crie|criar|gere|gerar|novo|nova)\b/.test(value))return"create";
  if(/\b(apague|apagar|delete|remova|remover|exclua|excluir)\b/.test(value))return"delete";
  if(/\b(mova|mover|renomeie|renomear|altere|alterar|edite|editar)\b/.test(value))return"update";
  if(/\b(envie|enviar|responda|responder)\b/.test(value))return"send";
  if(/\b(resuma|resumir|analise|analisar|explique)\b/.test(value))return"summarize";
  if(/\b(pesquise|pesquisar|procure|buscar|busque|encontre|liste|listar|mostre)\b/.test(value))return"read";
  if(/\b(abra|abrir|acesse|acessar|navegue)\b/.test(value))return"open";
  return undefined;
}
function operationFamily(operation:string){
  if(/create|mkdir|new/.test(operation))return"create";
  if(/delete|trash|remove/.test(operation))return"delete";
  if(/move|rename|update|write|edit/.test(operation))return"update";
  if(/send|reply/.test(operation))return"send";
  if(/summar|analy|extract/.test(operation))return"summarize";
  if(/search|find|list|research|fetch|read|latest|get/.test(operation))return"read";
  if(/open|navigate/.test(operation))return"open";
  return operation;
}
