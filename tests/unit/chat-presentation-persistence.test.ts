import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { ConversationService } from "../../packages/core/src/conversations/service";
import type { PresentationRecord } from "../../packages/core/src/chat/presentation/types";

let root: string, db: NexoDatabase, conversations: ConversationService;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-presentations-"));
  db = new NexoDatabase(root); await db.ready(); conversations = new ConversationService(db);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const record: PresentationRecord = {
  presentation: { version: 1, blocks: [{ version: 1, id: "emails", type: "resource_collection", domain: "email", title: "E-mails", items: [{ id: "item", resource: { kind: "email", messageId: "provider-id", subject: "Assunto", sender: { email: "sender@example.com" }, receivedAt: "2026-09-14T08:00:00Z" }, actions: [{ id: "email.trash", icon: "trash", label: "Lixeira", mutation: true }] }] }] },
  bindings: [{ blockId: "emails", itemId: "item", toolName: "email_search", input: { connectionId: "private-connection" } }],
};
it("restores cards after reopening the database without exposing action bindings", async () => {
  const conversation = conversations.defaultConversation();
  conversations.addMessage(conversation.id, "assistant", "Fallback", undefined, [], record);
  const reopened = new NexoDatabase(root); await reopened.ready();
  const message = new ConversationService(reopened).getMessages(conversation.id)[0];
  expect(message.content).toBe("Fallback"); expect(message.blocks).toEqual(record.presentation.blocks);
  expect(JSON.stringify(message)).not.toContain("private-connection");
});
it("keeps legacy, unknown-version and malformed presentations readable as text", () => {
  const id = conversations.defaultConversation().id;
  const message = conversations.addMessage(id, "assistant", "Legacy");
  expect(conversations.getMessages(id)[0].blocks).toBeUndefined();
  conversations.savePresentation(message.id, record);
  db.run("UPDATE message_presentations SET version=99 WHERE message_id=?", [message.id]);
  expect(conversations.getMessages(id)[0]).toMatchObject({content: "Legacy", blocks: undefined});
  db.run("UPDATE message_presentations SET version=1,payload_json=? WHERE message_id=?", ['{"version":1,"blocks":[{"type":"resource_collection"}]}', message.id]);
  expect(conversations.getMessages(id)[0].blocks).toBeUndefined();
});
it("removes private bindings and presentations when their conversation is deleted", () => {
  const id = conversations.defaultConversation().id;
  conversations.addMessage(id, "assistant", "Fallback", undefined, [], record);
  conversations.deleteConversation(id);
  expect(db.all("SELECT * FROM message_presentations")).toEqual([]);
});
it("rejects malformed presentations atomically without inserting the message", () => {
  const id = conversations.defaultConversation().id;
  expect(() => conversations.addMessage(id, "assistant", "Invalid", undefined, [], { ...record, presentation: { version: 2 } as any })).toThrow();
  expect(conversations.getMessages(id)).toEqual([]);
});
