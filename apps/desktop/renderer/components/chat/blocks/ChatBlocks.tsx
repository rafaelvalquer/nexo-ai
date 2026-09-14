import type { ChatBlock } from "@nexo/shared";
import { MarkdownContent } from "../MarkdownContent";
import { ResourceCollection } from "./ResourceCollection";
import { ApprovalBlock } from "./ApprovalBlock";
import { ClarificationBlock } from "./ClarificationBlock";
import { BrowserRunBlock } from "./browser/BrowserRunBlock";
import "./resources.css";
export function ChatBlocks({blocks,conversationId,messageId}:{blocks:ChatBlock[];conversationId?:string;messageId?:string}) {
  return <div className="chatBlocks">{blocks.map(block=>{
    if(block.version!==1)return null;
    if(block.type==="text")return <MarkdownContent key={block.id} content={block.content}/>;
    if(block.type==="resource_collection")return <ResourceCollection key={block.id} block={block} conversationId={conversationId} messageId={messageId}/>;
    if(block.type==="approval")return <ApprovalBlock key={block.id} block={block} conversationId={conversationId} messageId={messageId}/>;
    if(block.type==="clarification")return <ClarificationBlock key={block.id} block={block} conversationId={conversationId}/>;
    if(block.type==="browser_run")return <BrowserRunBlock key={block.id} block={block} conversationId={conversationId}/>;
    return <p className={`resourceStatus ${block.state}`} role="status" key={block.id}>{block.text}</p>;
  })}</div>;
}
