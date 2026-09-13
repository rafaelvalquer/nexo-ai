import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";

export type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  taskId?: string;
  documentIds?: string[];
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

const MAIN_CONVERSATION = "assistant-main";

export class ChatHistoryService {
  constructor(private db: NexoDatabase) {
    const existing = this.db.get("SELECT id FROM conversations WHERE id=?", [MAIN_CONVERSATION]);
    if (!existing) {
      this.db.run(
        "INSERT INTO conversations(id,title,created_at) VALUES(?,?,?)",
        [MAIN_CONVERSATION, "Assistente", new Date().toISOString()]
      );
    }
  }

  add(role: PersistedChatMessage["role"], content: string, taskId?: string) {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.run(
      "INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)",
      [id, MAIN_CONVERSATION, role, content, createdAt]
    );
    if (taskId) this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)", [`message_task:${id}`, taskId]);
    return { id, role, content, createdAt, taskId, documentIds: [] } satisfies PersistedChatMessage;
  }

  attachDocuments(messageId: string, documentIds: string[]) {
    const unique = [...new Set(documentIds)].filter(Boolean);
    if (!unique.length) return [];
    const message = this.db.get("SELECT id FROM messages WHERE id=? AND conversation_id=?", [messageId, MAIN_CONVERSATION]);
    if (!message) throw new Error("Mensagem não encontrada para associar documentos.");
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const documentId of unique) {
        if (!this.db.get("SELECT id FROM documents WHERE id=?", [documentId])) throw new Error("Documento não encontrado para associação com a mensagem.");
        const existing = this.db.get("SELECT id FROM message_attachments WHERE message_id=? AND document_id=?", [messageId, documentId]);
        if (!existing) this.db.run("INSERT INTO message_attachments(id,message_id,document_id,created_at) VALUES(?,?,?,?)", [uuid(), messageId, documentId, now]);
      }
    });
    return unique;
  }

  attachmentsForMessage(messageId: string) {
    return this.db.all<{ document_id: string }>(
      "SELECT document_id FROM message_attachments WHERE message_id=? ORDER BY created_at ASC",
      [messageId]
    ).map(row => row.document_id);
  }

  list(limit = 200): PersistedChatMessage[] {
    const rows = this.db.all<MessageRow>(
      "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?",
      [MAIN_CONVERSATION, limit]
    );
    return rows.map(row => {
      const task = this.db.get<{value:string}>("SELECT value FROM application_state WHERE key=?", [`message_task:${row.id}`]);
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
        taskId: task?.value,
        documentIds: this.attachmentsForMessage(row.id)
      };
    });
  }
}
