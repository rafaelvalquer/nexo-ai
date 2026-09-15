import type { ApprovalService } from "../../permissions/approvals.js";
import type { PendingAgentAction } from "../loop/types.js";
import type { ApprovalConsumptionRepository } from "./approval-consumption-repository.js";
/** Verifies that approval authorizes exactly the persisted action before consuming it once. */
export class ApprovalCoordinator {
  constructor(private readonly approvals: ApprovalService, private readonly consumptions: ApprovalConsumptionRepository) {}
  consumeApproved(approvalId: string, action: PendingAgentAction) { const approval = this.approvals.list("all").find(item => item.id === approvalId); if (!approval || approval.status !== "approved") throw new Error("A aprovação não está concedida."); if (approval.toolName !== action.toolName || approval.fingerprint !== action.fingerprint || JSON.stringify(approval.input) !== JSON.stringify(action.input)) throw new Error("A aprovação não corresponde à ação pendente."); return this.consumptions.consume(approvalId, action.executionId, action.fingerprint); }
}
