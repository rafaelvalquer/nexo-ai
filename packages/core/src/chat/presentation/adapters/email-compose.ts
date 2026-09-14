import type { EmailComposeReviewBlock,ToolResult } from "@nexo/shared";
import type { PresentationAdapter } from "../registry.js";

export const emailComposeReviewAdapter:PresentationAdapter={
  toolNames:["__email_compose_review__"],
  build({result}: {toolName:string;input:Record<string,unknown>;result:ToolResult}){
    const block=result.data as EmailComposeReviewBlock|undefined;
    if(!block||block.type!=="email_compose_review"||!block.draftId)return[];
    return[block];
  }
};
