import { randomUUID } from "node:crypto";
import type { Approval, RiskLevel } from "@nexo/shared";
import { NexoDatabase } from "../database/db.js";

export class ApprovalService {
  constructor(private db: NexoDatabase) {}

  create(toolName: string, input: Record<string, unknown>, risk: RiskLevel, reason: string): Approval {
    const approval: Approval = { id: randomUUID(), createdAt: new Date().toISOString(), toolName, input, risk, reason, status: "pending" };
    this.db.run("INSERT INTO approvals(id,tool_name,input_json,risk,reason,status,created_at) VALUES(?,?,?,?,?,?,?)", [approval.id, toolName, JSON.stringify(input), risk, reason, approval.status, approval.createdAt]);
    return approval;
  }

  list(status: Approval["status"] | "all" = "pending"): Approval[] {
    const rows = status === "all"
      ? this.db.all<any>("SELECT * FROM approvals ORDER BY created_at DESC")
      : this.db.all<any>("SELECT * FROM approvals WHERE status=? ORDER BY created_at DESC", [status]);
    return rows.map(r => ({ id:r.id, toolName:r.tool_name, input:JSON.parse(r.input_json), risk:r.risk, reason:r.reason, status:r.status, createdAt:r.created_at }));
  }

  resolve(id: string, approved: boolean) {
    const status = approved ? "approved" : "rejected";
    this.db.run("UPDATE approvals SET status=? WHERE id=?", [status, id]);
    return this.db.get<any>("SELECT * FROM approvals WHERE id=?", [id]);
  }
}
