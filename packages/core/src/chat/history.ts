import type { NexoDatabase } from "../database/db.js";
import { ConversationService,LEGACY_MAIN_CONVERSATION,type ConversationMessage } from "../conversations/service.js";

export type PersistedChatMessage=Omit<ConversationMessage,"conversationId">;
/** Compatibility wrapper for legacy callers. New code should use ConversationService directly. */
export class ChatHistoryService{
  private conversations:ConversationService;
  constructor(db:NexoDatabase){this.conversations=new ConversationService(db);}
  add(role:PersistedChatMessage["role"],content:string,taskId?:string){const message=this.conversations.addMessage(this.conversationId(),role,content,taskId);const{conversationId,...legacy}=message;return legacy;}
  attachDocuments(messageId:string,documentIds:string[]){return this.conversations.attachDocuments(this.conversationId(),messageId,documentIds);}
  attachmentsForMessage(messageId:string){return this.conversations.attachmentsForMessage(messageId);}
  list(limit=200):PersistedChatMessage[]{return this.conversations.getMessages(this.conversationId(),limit).map(({conversationId,...message})=>message);}
  private conversationId(){return this.conversations.getConversation(LEGACY_MAIN_CONVERSATION)?.id??this.conversations.defaultConversation().id;}
}
