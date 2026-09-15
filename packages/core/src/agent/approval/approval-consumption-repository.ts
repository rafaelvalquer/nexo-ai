import type { NexoDatabase } from "../../database/db.js";
export type ApprovalConsumption = { approvalId: string; executionId: string; fingerprint: string; consumedAt: string };
/** SQLite transaction protects double-click and concurrent resume races. */
export class ApprovalConsumptionRepository {
  constructor(private readonly db: NexoDatabase) {}
  consume(approvalId: string, executionId: string, fingerprint: string): ApprovalConsumption { return this.db.transaction(() => { const prior = this.get(approvalId); if (prior) { if (prior.executionId === executionId && prior.fingerprint === fingerprint) return prior; throw new Error("A aprovação já foi consumida por outra execução."); } const existingExecution = this.db.get<{ approval_id: string }>("SELECT approval_id FROM approval_consumptions WHERE execution_id=?", [executionId]); if (existingExecution) throw new Error("A execução já está vinculada a outra aprovação."); const consumedAt = new Date().toISOString(); this.db.run("INSERT INTO approval_consumptions(approval_id,execution_id,fingerprint,consumed_at) VALUES(?,?,?,?)", [approvalId, executionId, fingerprint, consumedAt]); return { approvalId, executionId, fingerprint, consumedAt }; }); }
  get(approvalId: string) { const row = this.db.get<{ approval_id: string; execution_id: string; fingerprint: string; consumed_at: string }>("SELECT * FROM approval_consumptions WHERE approval_id=?", [approvalId]); return row && { approvalId: row.approval_id, executionId: row.execution_id, fingerprint: row.fingerprint, consumedAt: row.consumed_at }; }
}
