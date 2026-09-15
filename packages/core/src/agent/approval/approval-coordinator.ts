import type { ApprovalService } from "../../permissions/approvals.js";
import type { PendingAgentAction } from "../loop/types.js";
import type { ApprovalConsumptionRepository } from "./approval-consumption-repository.js";
import { actionFingerprint } from "../execution/action-executor.js";
/** Verifies that approval authorizes exactly the persisted action before consuming it once. */
export class ApprovalCoordinator {
  constructor(private readonly approvals: ApprovalService, private readonly consumptions: ApprovalConsumptionRepository) {}
  consumeApproved(approvalId: string, action: PendingAgentAction) { const approval = this.approvals.list("all").find(item => item.id === approvalId); if (!approval || approval.status !== "approved") throw new Error("A aprovação não está concedida."); if (approval.expiresAt&&Date.parse(approval.expiresAt)<=Date.now())throw new Error("A aprovação expirou.");const exact=actionFingerprint(action.toolName,action.input);if (approval.toolName !== action.toolName || approval.fingerprint !== action.fingerprint || exact!==action.fingerprint||actionFingerprint(approval.toolName,approval.input)!==approval.fingerprint) throw new Error("A aprovação não corresponde à ação pendente."); return this.consumptions.consume(approvalId, action.executionId, action.fingerprint); }
}
