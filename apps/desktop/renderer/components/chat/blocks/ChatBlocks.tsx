import type { ChatBlock } from "@nexo/shared";
import { MarkdownContent } from "../MarkdownContent";
import { ResourceCollection } from "./ResourceCollection";
import { ApprovalBlock } from "./ApprovalBlock";
import { ClarificationBlock } from "./ClarificationBlock";
import { EmailComposeReviewBlock } from "./email/EmailComposeReviewBlock";
import "./resources.css";
export function ChatBlocks({blocks,conversationId,messageId}:{blocks:ChatBlock[];conversationId?:string;messageId?:string}) {
  return <div className="chatBlocks">{blocks.map(block=>block.version!==1?null:block.type==="text"?<MarkdownContent key={block.id} content={block.content}/>:block.type==="resource_collection"?<ResourceCollection key={block.id} block={block} conversationId={conversationId} messageId={messageId}/>:block.type==="approval"?<ApprovalBlock key={block.id} block={block} conversationId={conversationId} messageId={messageId}/>:block.type==="clarification"?<ClarificationBlock key={block.id} block={block} conversationId={conversationId}/>:block.type==="email_compose_review"?<EmailComposeReviewBlock key={block.id} block={block}/>:<p className={`resourceStatus ${block.state}`} role="status" key={block.id}>{block.text}</p>)}</div>;
}
