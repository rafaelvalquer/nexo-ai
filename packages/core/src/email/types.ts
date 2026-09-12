export type EmailAddress = { email: string; name?: string };
export type EmailMessage = { id:string; provider:"google"|"microsoft"; threadId?:string; from:EmailAddress; to:EmailAddress[]; cc?:EmailAddress[]; subject:string; receivedAt:string; snippet?:string; bodyText?:string; isUnread?:boolean; hasAttachments?:boolean };
export type EmailSearchQuery = { connectionId:string; query?:string; unread?:boolean; maxResults?:number };
export type EmailDraftInput = { connectionId:string; to:EmailAddress[]; subject:string; bodyText:string; cc?:EmailAddress[] };
export type EmailDraft = { id:string; provider:"google"|"microsoft"; message:EmailDraftInput };
