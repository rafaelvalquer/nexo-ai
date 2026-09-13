import { v4 as uuid } from "uuid";
import type { NexoDatabase } from "../database/db.js";
import { ConversationRepository } from "./repository.js";

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

  addMessage(conversationId: string, role: ConversationMessage["role"], content: string, taskId?: string, documentIds: string[] = []) {
    this.ensureConversation(conversationId);
    const id=uuid(),createdAt=new Date().toISOString();
    this.db.run("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)",[id,conversationId,role,content,createdAt]);
    if(taskId)this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[`message_task:${id}`,taskId]);
    if(documentIds.length)this.attachDocuments(conversationId,id,documentIds);
    this.repo.touch(conversationId);
    if(role==="user")this.autoTitle(conversationId,content);
    return {id,conversationId,role,content,createdAt,taskId,documentIds:[...new Set(documentIds)]} satisfies ConversationMessage;
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

  getMessages(conversationId: string, limit=200): ConversationMessage[] {
    this.ensureConversation(conversationId);
    const rows=this.db.all<MessageRow>("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?",[conversationId,limit]);
    return rows.map(row=>{const task=this.db.get<{value:string}>("SELECT value FROM application_state WHERE key=?",[`message_task:${row.id}`]);return{id:row.id,conversationId:row.conversation_id,role:row.role,content:row.content,createdAt:row.created_at,taskId:task?.value,documentIds:this.attachmentsForMessage(row.id)};});
  }

  private autoTitle(id:string,content:string){const row=this.repo.get(id);if(!row)return;const title=(row.title??"").trim();if(title&&!["Novo chat","Assistente"].includes(title))return;const compact=content.replace(/\s+/g," ").trim();if(!compact)return;this.repo.rename(id,compact.length>42?compact.slice(0,39)+"…":compact);}
  private safeTitle(value:string){const title=value.replace(/\s+/g," ").trim();if(!title)return"Novo chat";return title.slice(0,80);}
  private toSummary(row:{id:string;title:string|null;created_at:string;updated_at:string|null}):ConversationSummary{return{id:row.id,title:row.title?.trim()||"Novo chat",createdAt:row.created_at,updatedAt:row.updated_at??row.created_at};}
}
