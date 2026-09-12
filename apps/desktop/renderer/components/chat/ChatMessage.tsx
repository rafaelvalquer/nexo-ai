import type { ChatMessage as ChatMessageModel } from "@nexo/shared";
import { UserMessage } from "./UserMessage";import { AssistantMessage } from "./AssistantMessage";
export function ChatMessage({message}:{message:ChatMessageModel}){return message.role==="user"?<UserMessage message={message}/>:<AssistantMessage message={message}/>;}
