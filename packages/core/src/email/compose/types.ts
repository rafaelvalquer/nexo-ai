import type { EmailComposeDraftSnapshot } from "@nexo/shared";

export type EmailComposeDraft=EmailComposeDraftSnapshot;
export type CreateEmailComposeDraftInput={
  conversationId:string;
  taskId?:string;
  connectionId?:string;
  to:string[];
  subject:string;
  bodyText:string;
};
export type EmailDraftSubmitResult={approvalId?:string};
export type EmailDraftExecutor=(draft:Readonly<EmailComposeDraft>)=>Promise<EmailDraftSubmitResult>;
