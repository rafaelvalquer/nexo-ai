import type { EmailComposeReviewBlock } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";

export const emailComposeReviewAdapter:PresentationAdapter=(result)=>{
  const block=result.data as EmailComposeReviewBlock|undefined;
  if(!block||block.type!=="email_compose_review"||!block.draftId)return undefined;
  return{presentation:{version:1,blocks:[block]},bindings:[]};
};
