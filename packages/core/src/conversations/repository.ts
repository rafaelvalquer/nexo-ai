import { randomUUID } from "node:crypto";
import type { NexoDatabase } from "../database/db.js";

export type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string | null;
};

export class ConversationRepository {
  constructor(private db: NexoDatabase) {}

  create(title = "Novo chat") {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.run("INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)", [id, title, now, now]);
    return this.get(id)!;
  }

  get(id: string) {
    return this.db.get<ConversationRow>("SELECT * FROM conversations WHERE id=?", [id]);
  }

  list() {
    return this.db.all<ConversationRow>("SELECT * FROM conversations ORDER BY COALESCE(updated_at,created_at) DESC");
  }

  rename(id: string, title: string) {
    this.db.run("UPDATE conversations SET title=?,updated_at=? WHERE id=?", [title, new Date().toISOString(), id]);
    return this.get(id);
  }

  touch(id: string) {
    this.db.run("UPDATE conversations SET updated_at=? WHERE id=?", [new Date().toISOString(), id]);
  }

  delete(id: string) {
    this.db.transaction(() => {
      const messageIds = this.db.all<{id:string}>("SELECT id FROM messages WHERE conversation_id=?", [id]).map(row => row.id);
      for (const messageId of messageIds) {
        this.db.run("DELETE FROM message_presentations WHERE message_id=?", [messageId]);
        this.db.run("DELETE FROM chat_resource_actions WHERE message_id=?", [messageId]);
        this.db.run("DELETE FROM message_attachments WHERE message_id=?", [messageId]);
        this.db.run("DELETE FROM application_state WHERE key=?", [`message_task:${messageId}`]);
      }
      this.db.run("DELETE FROM messages WHERE conversation_id=?", [id]);
      this.db.run("DELETE FROM application_state WHERE key=?", [`document_context:${id}`]);
      this.db.run("DELETE FROM conversations WHERE id=?", [id]);
    });
  }
}
