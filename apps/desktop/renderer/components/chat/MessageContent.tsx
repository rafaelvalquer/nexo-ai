import type { ChatMessage } from "@nexo/shared";
import { MarkdownContent } from "./MarkdownContent";
import { ChatBlocks } from "./blocks/ChatBlocks";
export function MessageContent({message}:{message:ChatMessage}) {
  return message.blocks?.length&&message.blocks.every(block=>block.version===1)?<ChatBlocks blocks={message.blocks} conversationId={message.conversationId} messageId={message.id}/>:<MarkdownContent content={message.content}/>;
}
