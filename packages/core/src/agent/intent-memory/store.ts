import { randomUUID } from "node:crypto";
import type { NexoDatabase } from "../../database/db.js";
import type { AgentIntent, IntentDomain } from "../orchestrator/intent-schema.js";

export type IntentExampleSource = "user_correction" | "confirmed_execution" | "successful_execution" | "user_clarification";
export type IntentExampleEvidence={successCount?:number;failureCount?:number;lastVerifiedAt?:string;resolverVersion?:string;modelId?:string};
export type StoredIntentExample = {
  id: string;
  utterance: string;
  normalizedUtterance: string;
  domain: IntentDomain;
  intent: AgentIntent["intent"];
  operation: string;
  entities: Record<string, unknown>;
  source: IntentExampleSource;
  confidence: number;
  successful: boolean;
  confirmedByUser: boolean;
  embedding?: number[];
  successCount:number;
  failureCount:number;
  lastVerifiedAt?:string;
  resolverVersion?:string;
  modelId?:string;
  createdAt: string;
  lastUsedAt?: string;
};

const MAX_ACTIVE = 500;

export class IntentMemoryStore {
  constructor(private readonly db: NexoDatabase) {}

  remember(utterance: string, intent: AgentIntent, source: IntentExampleSource, embedding?: number[], evidence:IntentExampleEvidence={}) {
    const normalized = normalizeUtterance(utterance);
    if (!normalized || intent.status !== "ready") return;
    const existing = this.db.get<{id:string;success_count?:number;failure_count?:number}>(
      "SELECT id,success_count,failure_count FROM intent_examples WHERE normalized_utterance=? AND domain=? AND intent=? AND operation=? LIMIT 1",
      [normalized, intent.domain, intent.intent, intent.operation]
    );
    const now = new Date().toISOString();
    const confirmed = source === "user_correction" || source === "confirmed_execution" || source === "user_clarification";
    const successCount=Math.max(1,evidence.successCount??1),failureCount=Math.max(0,evidence.failureCount??0),lastVerifiedAt=evidence.lastVerifiedAt??now;
    if (existing) {
      this.db.run(
        "UPDATE intent_examples SET entities_json=?,source=?,confidence=?,successful=1,confirmed_by_user=?,embedding_json=COALESCE(?,embedding_json),last_used_at=?,success_count=?,failure_count=?,last_verified_at=?,resolver_version=?,model_id=? WHERE id=?",
        [JSON.stringify(intent.entities ?? {}), source, intent.confidence, confirmed ? 1 : 0, embedding?.length ? JSON.stringify(embedding) : null, now, Math.max(Number(existing.success_count??0),successCount), Math.max(Number(existing.failure_count??0),failureCount),lastVerifiedAt,evidence.resolverVersion??"accuracy-context-learning-v1",evidence.modelId??null,existing.id]
      );
    } else {
      this.db.run(
        "INSERT INTO intent_examples(id,utterance,normalized_utterance,domain,intent,operation,entities_json,source,confidence,successful,confirmed_by_user,embedding_json,created_at,last_used_at,success_count,failure_count,last_verified_at,resolver_version,model_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [randomUUID(), utterance.slice(0, 2000), normalized, intent.domain, intent.intent, intent.operation, JSON.stringify(intent.entities ?? {}), source, intent.confidence, 1, confirmed ? 1 : 0, embedding?.length ? JSON.stringify(embedding) : null, now, now, successCount,failureCount,lastVerifiedAt,evidence.resolverVersion??"accuracy-context-learning-v1",evidence.modelId??null]
      );
    }
    this.trim();
  }

  candidates(domain?: IntentDomain, limit = 120): StoredIntentExample[] {
    const rows = this.db.all<any>(
      domain
        ? "SELECT * FROM intent_examples WHERE domain=? ORDER BY confirmed_by_user DESC,CASE source WHEN 'user_clarification' THEN 4 WHEN 'user_correction' THEN 3 WHEN 'confirmed_execution' THEN 2 ELSE 1 END DESC,success_count DESC,failure_count ASC,last_verified_at DESC,last_used_at DESC LIMIT ?"
        : "SELECT * FROM intent_examples ORDER BY confirmed_by_user DESC,CASE source WHEN 'user_clarification' THEN 4 WHEN 'user_correction' THEN 3 WHEN 'confirmed_execution' THEN 2 ELSE 1 END DESC,success_count DESC,failure_count ASC,last_verified_at DESC,last_used_at DESC LIMIT ?",
      domain ? [domain, limit] : [limit]
    );
    return rows.map(row => this.map(row));
  }

  touch(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    for (const id of ids) this.db.run("UPDATE intent_examples SET last_used_at=? WHERE id=?", [now, id]);
  }

  clear() { this.db.run("DELETE FROM intent_examples"); }
  count() { return Number(this.db.get<{count:number}>("SELECT COUNT(*) AS count FROM intent_examples")?.count ?? 0); }

  private trim() {
    const count = this.count();
    if (count <= MAX_ACTIVE) return;
    this.db.run(`DELETE FROM intent_examples WHERE id IN (
      SELECT id FROM intent_examples
      ORDER BY confirmed_by_user ASC,failure_count DESC,success_count ASC,CASE source WHEN 'successful_execution' THEN 1 WHEN 'confirmed_execution' THEN 2 WHEN 'user_correction' THEN 3 ELSE 4 END ASC,last_used_at ASC,created_at ASC
      LIMIT ?
    )`, [count - MAX_ACTIVE]);
  }

  private map(row: any): StoredIntentExample {
    return {
      id: String(row.id),
      utterance: String(row.utterance),
      normalizedUtterance: String(row.normalized_utterance),
      domain: row.domain as IntentDomain,
      intent: row.intent,
      operation: String(row.operation),
      entities: safeJson(row.entities_json, {}),
      source: row.source as IntentExampleSource,
      confidence: Number(row.confidence ?? 0),
      successful: Boolean(row.successful),
      confirmedByUser: Boolean(row.confirmed_by_user),
      embedding: safeJson(row.embedding_json, undefined),
      successCount:Number(row.success_count??1),
      failureCount:Number(row.failure_count??0),
      lastVerifiedAt:row.last_verified_at?String(row.last_verified_at):undefined,
      resolverVersion:row.resolver_version?String(row.resolver_version):undefined,
      modelId:row.model_id?String(row.model_id):undefined,
      createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined
    };
  }
}

export function normalizeUtterance(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").slice(0, 2000);
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
