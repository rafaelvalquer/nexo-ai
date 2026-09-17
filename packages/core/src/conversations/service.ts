import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";
import { ConversationRepository } from "./repository.js";
import { validateConversationPageOptions, type ConversationPageOptions, type ConversationCursor, type ChatBlock } from "@nexo/shared";
import { parsePresentation, resourceBindingsSchema, type PresentationRecord } from "../chat/presentation/types.js";

export const LEGACY_MAIN_CONVERSATION = "assistant-main";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: ChatBlock[];
  createdAt: string;
  taskId?: string;
  documentIds?: string[];
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ConversationMessage["role"];
  content: string;
  created_at: string;
};

export class ConversationService {
  private repo: ConversationRepository;
  constructor(private db: NexoDatabase) {
    this.repo = new ConversationRepository(db);
    this.ensureInitialConversation();
  }

  private ensureInitialConversation() {
    if (this.repo.list().length) return;
    const now = new Date().toISOString();
    this.db.run("INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)", [LEGACY_MAIN_CONVERSATION, "Assistente", now, now]);
  }

  defaultConversation() {
    this.ensureInitialConversation();
    const legacy = this.repo.get(LEGACY_MAIN_CONVERSATION);
    return this.toSummary(legacy ?? this.repo.list()[0]);
  }

  createConversation(title = "Novo chat") { return this.toSummary(this.repo.create(this.safeTitle(title))); }
  listConversations() { this.ensureInitialConversation(); return this.repo.list().map(row => this.toSummary(row)); }
  getConversation(id: string) { const row=this.repo.get(id); return row ? this.toSummary(row) : undefined; }
  ensureConversation(id: string) { const row=this.getConversation(id); if(!row)throw new Error("Conversa não encontrada."); return row; }
  renameConversation(id: string, title: string) { this.ensureConversation(id); return this.toSummary(this.repo.rename(id,this.safeTitle(title))!); }
  deleteConversation(id: string) { this.ensureConversation(id); this.repo.delete(id); this.ensureInitialConversation(); return {ok:true}; }

  addMessage(conversationId: string, role: ConversationMessage["role"], content: string, taskId?: string, documentIds: string[] = [], presentation?: PresentationRecord) {
    this.ensureConversation(conversationId);
    const id=uuid(),createdAt=new Date().toISOString();
    this.db.transaction(() => {
      this.db.run("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)",[id,conversationId,role,content,createdAt]);
      if (presentation) this.savePresentation(id, presentation);
      if(taskId)this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[`message_task:${id}`,taskId]);
      if(documentIds.length)this.attachDocuments(conversationId,id,documentIds);
      this.repo.touch(conversationId);
      if(role==="user")this.autoTitle(conversationId,content);
    });
    return {id,conversationId,role,content,createdAt,taskId,documentIds:[...new Set(documentIds)],blocks:presentation?.presentation.blocks} satisfies ConversationMessage;
  }

  savePresentation(messageId: string, record: PresentationRecord) {
    if (!this.db.get("SELECT id FROM messages WHERE id=?", [messageId])) throw new Error("Mensagem não encontrada.");
    const presentation = parsePresentation(record.presentation);
    const bindings = resourceBindingsSchema.safeParse(record.bindings);
    if (!presentation || !bindings.success) throw new Error("Apresentação de mensagem inválida.");
    this.db.run("INSERT OR REPLACE INTO message_presentations(message_id,version,payload_json,bindings_json,created_at) VALUES(?,?,?,?,?)", [messageId, 1, JSON.stringify(presentation), JSON.stringify(bindings.data), new Date().toISOString()]);
  }

  presentationForMessage(messageId: string) {
    return this.presentationRecordForMessage(messageId)?.presentation;
  }

  /** Internal action resolution uses this method; IPC returns only presentationForMessage. */
  presentationRecordForMessage(messageId: string): PresentationRecord | undefined {
    return this.presentationRecords([messageId]).get(messageId);
  }

  private presentationRecords(messageIds: string[]): Map<string, PresentationRecord> {
    const records = new Map<string, PresentationRecord>();
    if (!messageIds.length) return records;
    const placeholders = messageIds.map(() => "?").join(",");
    const rows = this.db.all<{message_id:string;version:number;payload_json:string;bindings_json:string}>(
      `SELECT message_id,version,payload_json,bindings_json FROM message_presentations WHERE message_id IN (${placeholders})`, messageIds);
    const approvalIds = new Set<string>(), clarificationIds = new Set<string>();
    for (const row of rows) {
      if (row.version !== 1) continue;
      try {
        const presentation = parsePresentation(JSON.parse(row.payload_json));
        const bindings = resourceBindingsSchema.safeParse(JSON.parse(row.bindings_json));
        if (!presentation || !bindings.success) continue;
        records.set(row.message_id, { presentation, bindings: bindings.data });
        for (const block of presentation.blocks) {
          if (block.type === "approval") approvalIds.add(block.approvalId);
          if (block.type === "clarification") clarificationIds.add(block.clarificationId);
        }
      } catch { /* Ignore malformed legacy presentations, preserving message text. */ }
    }
    const readStates = <T extends {id:string}>(table: string, columns: string, ids: Set<string>) => {
      const result = new Map<string,T>(), values = [...ids];
      for (let i = 0; i < values.length; i += 500) {
        const batch = values.slice(i,i+500);
        for (const row of this.db.all<T>(`SELECT id,${columns} FROM ${table} WHERE id IN (${batch.map(()=>"?").join(",")})`,batch)) result.set(row.id,row);
      }
      return result;
    };
    const approvals = readStates<{id:string;status:"pending"|"approved"|"rejected"|"expired";expires_at:string|null}>("approvals","status,expires_at",approvalIds);
    const clarifications = readStates<{id:string;status:string;values_json:string;expires_at:string|null}>("pending_clarifications","status,values_json,expires_at",clarificationIds);
    for (const record of records.values()) for (const block of record.presentation.blocks) {
      if (block.type === "approval") {
        const approval = approvals.get(block.approvalId);
        if (approval) block.status = approval.status === "pending" && approval.expires_at && Date.parse(approval.expires_at) <= Date.now() ? "expired" : approval.status;
      }
      if (block.type === "clarification") {
        const clarification = clarifications.get(block.clarificationId);
        if (!clarification) continue;
        const expired = clarification.status === "pending" && clarification.expires_at && Date.parse(clarification.expires_at) <= Date.now();
        block.state = expired ? "expired" : clarification.status === "resolved" ? "submitted" : clarification.status === "cancelled" ? "cancelled" : clarification.status === "expired" ? "expired" : "pending";
        try { const values = JSON.parse(clarification.values_json); if (Object.keys(values).length) block.values = values; } catch {}
      }
    }
    return records;
  }

  attachDocuments(conversationId: string, messageId: string, documentIds: string[]) {
    const unique=[...new Set(documentIds)].filter(Boolean);
    const message=this.db.get("SELECT id FROM messages WHERE id=? AND conversation_id=?",[messageId,conversationId]);
    if(!message)throw new Error("Mensagem não encontrada para associar documentos.");
    const now=new Date().toISOString();
    this.db.transaction(()=>{for(const documentId of unique){
      if(!this.db.get("SELECT id FROM documents WHERE id=?",[documentId]))throw new Error("Documento não encontrado para associação com a mensagem.");
      if(!this.db.get("SELECT id FROM message_attachments WHERE message_id=? AND document_id=?",[messageId,documentId]))this.db.run("INSERT INTO message_attachments(id,message_id,document_id,created_at) VALUES(?,?,?,?)",[uuid(),messageId,documentId,now]);
    }});
    return unique;
  }

  attachmentsForMessage(messageId: string) { return this.db.all<{document_id:string}>("SELECT document_id FROM message_attachments WHERE message_id=? ORDER BY created_at ASC",[messageId]).map(row=>row.document_id); }

  getMessages(conversationId: string, limit = 200): ConversationMessage[] {
    return this.getMessagePage(conversationId, { limit }).messages;
  }

  getMessage(conversationId: string, messageId: string): ConversationMessage | undefined {
    this.ensureConversation(conversationId);
    const row = this.db.get<MessageRow>("SELECT * FROM messages WHERE conversation_id=? AND id=?", [conversationId,messageId]);
    return row ? this.hydrateMessages([row])[0] : undefined;
  }

  getMessagePage(conversationId: string, options: ConversationPageOptions = {}) {
    this.ensureConversation(conversationId);
    const { limit = 50, before } = validateConversationPageOptions(conversationId, options);
    const cursorCondition = before ? " AND (created_at < ? OR (created_at = ? AND id < ?))" : "";
    const params: unknown[] = before ? [conversationId,before.createdAt,before.createdAt,before.id,limit+1] : [conversationId,limit+1];
    const rows = this.db.all<MessageRow>(`SELECT * FROM messages WHERE conversation_id=?${cursorCondition} ORDER BY created_at DESC,id DESC LIMIT ?`,params);
    const hasMore = rows.length > limit;
    const selected = rows.slice(0,limit).reverse();
    const oldest = selected[0];
    const nextCursor: ConversationCursor | undefined = hasMore && oldest ? { conversationId,createdAt:oldest.created_at,id:oldest.id } : undefined;
    return { messages:this.hydrateMessages(selected), hasMore, nextCursor };
  }

  private hydrateMessages(rows: MessageRow[]): ConversationMessage[] {
    if (!rows.length) return [];
    const ids = rows.map(row=>row.id), placeholders = ids.map(()=>"?").join(",");
    const tasks = new Map(this.db.all<{key:string;value:string}>(`SELECT key,value FROM application_state WHERE key IN (${placeholders})`,ids.map(id=>`message_task:${id}`)).map(row=>[row.key,row.value]));
    const attachments = new Map<string,string[]>();
    for (const row of this.db.all<{message_id:string;document_id:string}>(`SELECT message_id,document_id FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY created_at,id`,ids)) {
      const values = attachments.get(row.message_id) ?? [];
      values.push(row.document_id);
      attachments.set(row.message_id,values);
    }
    const presentations = this.presentationRecords(ids);
    return rows.map(row=>({id:row.id,conversationId:row.conversation_id,role:row.role,content:row.content,createdAt:row.created_at,
      taskId:tasks.get(`message_task:${row.id}`),documentIds:attachments.get(row.id)??[],blocks:presentations.get(row.id)?.presentation.blocks}));
  }

  private autoTitle(id:string,content:string){const row=this.repo.get(id);if(!row)return;const title=(row.title??"").trim();if(title&&!["Novo chat","Assistente"].includes(title))return;const compact=content.replace(/\s+/g," ").trim();if(!compact)return;this.repo.rename(id,compact.length>42?compact.slice(0,39)+"…":compact);}
  private safeTitle(value:string){const title=value.replace(/\s+/g," ").trim();if(!title)return"Novo chat";return title.slice(0,80);}
  private toSummary(row:{id:string;title:string|null;created_at:string;updated_at:string|null}):ConversationSummary{return{id:row.id,title:row.title?.trim()||"Novo chat",createdAt:row.created_at,updatedAt:row.updated_at??row.created_at};}
}
