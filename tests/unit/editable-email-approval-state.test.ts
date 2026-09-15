import { describe, expect, it } from "vitest";
import type { ApprovalBlock } from "@nexo/shared";
import { editableEmailReviewInitialStatus } from "../../apps/desktop/renderer/components/chat/blocks/email/approval-review-state.js";

function block(status: ApprovalBlock["status"]): ApprovalBlock {
  return {
    id: "block-1",
    version: 1,
    type: "approval",
    approvalId: "approval-1",
    title: "Enviar e-mail",
    status,
    editableEmail: {
      to: ["rafael@example.com"],
      subject: "Oi",
      bodyText: "Oi"
    }
  };
}

describe("editable email approval state", () => {
  it("keeps a fresh pending send editable", () => {
    expect(editableEmailReviewInitialStatus(block("pending"), false)).toBe("review");
  });

  it("rehydrates a rejected original approval instead of showing action cancelled", () => {
    expect(editableEmailReviewInitialStatus(block("rejected"), false)).toBe("sending");
  });

  it("does not revive expired or unrelated terminal approvals", () => {
    expect(editableEmailReviewInitialStatus(block("expired"), true)).toBeUndefined();
    expect(editableEmailReviewInitialStatus(block("approved"), false)).toBeUndefined();
  });
});
