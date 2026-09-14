import type { ChatMessage as ChatMessageModel } from "@nexo/shared";
import { UserMessage } from "./UserMessage";import { AssistantMessage } from "./AssistantMessage";
export function ChatMessage({message,grouped=false}:{message:ChatMessageModel;grouped?:boolean}){return message.role==="user"?<UserMessage message={message} grouped={grouped}/>:<AssistantMessage message={message} grouped={grouped}/>;}
