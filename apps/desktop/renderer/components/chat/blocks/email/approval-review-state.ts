import type { ApprovalBlock } from "@nexo/shared";

export type EditableEmailReviewInitialStatus = "review" | "sending";

/**
 * Email send approvals are converted into persisted drafts as soon as the
 * review UI hydrates. The original approval is then rejected on purpose so
 * the pre-edit exact action can never be executed later.
 *
 * A rejected editable-email approval therefore means "hydrate the draft",
 * not "show action cancelled". Start it locked until the persisted draft
 * reveals whether it is still under review, already sent, or cancelled.
 */
export function editableEmailReviewInitialStatus(
  block: ApprovalBlock,
  expired: boolean
): EditableEmailReviewInitialStatus | undefined {
  if (!block.editableEmail || expired) return undefined;
  if (block.status === "pending") return "review";
  if (block.status === "rejected") return "sending";
  return undefined;
}
