import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";

export type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  taskId?: string;
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
    return { id, role, content, createdAt, taskId } satisfies PersistedChatMessage;
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
        taskId: task?.value
      };
    });
  }
}
