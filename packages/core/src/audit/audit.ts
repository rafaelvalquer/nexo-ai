import { randomUUID } from "node:crypto";
import type { RiskLevel } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";
import { redactAuditDetails } from "../privacy/redaction.js";

export class AuditService {
  constructor(private db: NexoDatabase, private readonly isPrivate = () => false) {}

  record(action: string, risk: RiskLevel, status: string, details: unknown = {}) {
    const entry = {
      id: randomUUID(),
      action,
      risk,
      status,
      details: this.isPrivate() ? { redacted: true } : redactAuditDetails(details),
      createdAt: new Date().toISOString()
    };
    this.db.run(
      "INSERT INTO audit_logs(id, action, risk, status, details_json, created_at) VALUES(?,?,?,?,?,?)",
      [entry.id, action, risk, status, JSON.stringify(entry.details), entry.createdAt]
    );
    return entry;
  }

  list(limit = 100) {
    return this.db.all<any>("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", [limit]).map(r => ({
      id: r.id, action: r.action, risk: r.risk, status: r.status,
      details: r.details_json ? JSON.parse(r.details_json) : {}, createdAt: r.created_at
    }));
  }
}
