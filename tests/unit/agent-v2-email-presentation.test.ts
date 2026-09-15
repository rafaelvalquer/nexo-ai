import { describe, expect, it } from "vitest";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder.js";
import { modelVisiblePresentationData, wrapPresentationData } from "../../packages/core/src/chat/presentation/internal-metadata.js";

const emailPage = {
  messages: [{
    id: "message-1",
    threadId: "thread-1",
    subject: "Teste",
    from: { email: "sender@example.com", name: "Sender" },
    receivedAt: "2026-09-15T17:07:00.000Z",
    snippet: "Olá",
    isUnread: true,
    hasAttachments: false
  }],
  total: 1
};

describe("Agent V2 email presentation context", () => {
  it("restores card actions and bindings from the Core-only effective input", () => {
    const builder = new ChatPresentationBuilder();
    const data = wrapPresentationData(emailPage, { connectionId: "conn-secret", maxResults: 10, __connectionCapabilities: ["email.read", "email.modify"] });
    const record = builder.fromToolResult("email_latest", { ok: true, summary: "1 e-mail", data }, {});
    const block = record.presentation.blocks[0];

    expect(block.type).toBe("resource_collection");
    if (block.type !== "resource_collection") throw new Error("resource collection expected");
    expect(block.items[0].actions.map(action => action.id)).toEqual(expect.arrayContaining(["email.reply", "email.archive", "email.mark_read", "email.trash", "email.expand"]));
    expect(block.items[0].actions.find(action=>action.id==="email.reply")?.disabled).toBe(true);
    expect(block.items[0].actions.find(action=>action.id==="email.archive")?.disabled).toBe(false);
    expect(block.items[0].actions.find(action=>action.id==="email.trash")?.disabled).toBe(false);
    expect(record.bindings[0]?.input.connectionId).toBe("conn-secret");
    expect(record.bindings[0]?.input.messageId).toBe("message-1");
  });

  it("enables reply when email.send is operational", () => {
    const builder = new ChatPresentationBuilder();
    const data = wrapPresentationData(emailPage, { connectionId: "conn-secret", __connectionCapabilities: ["email.read", "email.send", "email.modify"] });
    const record = builder.fromToolResult("email_latest", { ok: true, summary: "1 e-mail", data }, {});
    const block = record.presentation.blocks[0];
    if (block.type !== "resource_collection") throw new Error("resource collection expected");
    expect(block.items[0].actions.find(action=>action.id==="email.reply")?.disabled).toBe(false);
  });

  it("never exposes the internal connection id or capabilities in model-visible observation data", () => {
    const wrapped = wrapPresentationData(emailPage, { connectionId: "conn-secret", query: "is:inbox", __connectionCapabilities: ["email.read", "email.modify"] });
    expect(modelVisiblePresentationData(wrapped)).toEqual(emailPage);
    const visible=JSON.stringify(modelVisiblePresentationData(wrapped));
    expect(visible).not.toContain("conn-secret");
    expect(visible).not.toContain("email.modify");
  });
});
