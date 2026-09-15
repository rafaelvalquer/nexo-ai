import { describe, expect, it } from "vitest";
import type { Approval } from "@nexo/shared";
import { ChatPresentationSession } from "../../packages/core/src/chat/presentation/session.js";
import { parsePresentation } from "../../packages/core/src/chat/presentation/types.js";

describe("editable email approval", () => {
  it("projects only editable email fields, preserves them through parsing and never exposes connectionId", () => {
    const approval: Approval = {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: new Date().toISOString(),
      toolName: "email_send_composed",
      input: {
        connectionId: "22222222-2222-4222-8222-222222222222",
        to: [{ email: "rafael@example.com", name: "Rafael" }],
        subject: "Oi",
        bodyText: "Olá"
      },
      risk: "SENSITIVE",
      reason: "Enviar e-mail para Rafael",
      status: "pending"
    };

    const record = new ChatPresentationSession().finish("Confirme o envio.", approval);
    const parsed = record ? parsePresentation(record.presentation) : undefined;
    const block = parsed?.blocks[0];

    expect(block?.type).toBe("approval");
    if (!block || block.type !== "approval") throw new Error("Approval block esperado");
    expect(block.editableEmail).toEqual({
      to: ["rafael@example.com"],
      subject: "Oi",
      bodyText: "Olá"
    });
    expect(JSON.stringify(block)).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("does not make non-email approvals editable after parsing", () => {
    const approval: Approval = {
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date().toISOString(),
      toolName: "delete_file",
      input: { path: "C:/tmp/a.txt" },
      risk: "CRITICAL",
      reason: "Excluir arquivo",
      status: "pending"
    };

    const record = new ChatPresentationSession().finish("Confirme.", approval);
    const parsed = record ? parsePresentation(record.presentation) : undefined;
    const block = parsed?.blocks[0];
    if (!block || block.type !== "approval") throw new Error("Approval block esperado");
    expect(block.editableEmail).toBeUndefined();
  });
});
