import {contract} from "./types.js";
export const emailIntentContracts={
 email_latest:contract("email","list",[],["limit","mailbox","connectionId"]),
 email_search:contract("email","find",["query"],["mailbox","limit","unread","connectionId"]),
 email_get:contract("email","read",["messageId"],["connectionId"]),
 email_get_many:contract("email","read",["messageIds"],["connectionId"]),
 email_read:contract("email","read",["messageId"],["connectionId"]),
 email_send:contract("email","update",["to","body"],["subject","cc","bcc","connectionId"]),
 email_send_composed:contract("email","update",["to","bodyText"],["subject","cc","bcc","connectionId"]),
 email_reply:contract("email","update",["messageId","body"],["connectionId"]),
 email_archive:contract("email","update",["messageId"],["connectionId"]),
 email_trash:contract("email","delete",["messageId"],["connectionId"]),
 email_mark_read:contract("email","update",["messageId"],["connectionId"]),
 email_mark_unread:contract("email","update",["messageId"],["connectionId"])
} as const;
