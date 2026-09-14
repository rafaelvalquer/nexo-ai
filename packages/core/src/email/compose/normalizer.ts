import { extractEmailAddresses } from "./extractor.js";

const RECIPIENT_ALIASES=["to","recipient","recipients","recipientEmail","recipientEmails","email"] as const;
const BODY_ALIASES=["body","message","text","content"] as const;

export type EmailComposeEntities={to:string[];subject?:string;body:string};

export function normalizeRecipients(value:unknown):string[]{
  const values=Array.isArray(value)?value:[value];
  const recipients:string[]=[];
  for(const item of values){
    if(typeof item==="string")recipients.push(...extractEmailAddresses(item));
    else if(item&&typeof item==="object"&&typeof (item as Record<string,unknown>).email==="string")recipients.push(...extractEmailAddresses(String((item as Record<string,unknown>).email)));
  }
  return[...new Set(recipients.map(email=>email.toLowerCase()))];
}

export function normalizeRecipientsFromEntities(entities:Record<string,unknown>):string[]{
  const recipients:string[]=[];
  for(const key of RECIPIENT_ALIASES)recipients.push(...normalizeRecipients(entities[key]));
  return[...new Set(recipients)];
}

export function normalizeBody(entities:Record<string,unknown>):string|undefined{
  for(const key of BODY_ALIASES){const value=entities[key];if(typeof value==="string"&&value.trim())return value.trim();}
  return undefined;
}

export function canonicalizeEmailComposeEntities(entities:Record<string,unknown>):Record<string,unknown>{
  const canonical={...entities};
  for(const key of RECIPIENT_ALIASES)delete canonical[key];
  for(const key of BODY_ALIASES)delete canonical[key];
  const to=normalizeRecipientsFromEntities(entities),body=normalizeBody(entities);
  if(to.length)canonical.to=to;
  if(body)canonical.body=body;
  return canonical;
}

export function hasRecipients(entities:Record<string,unknown>){return normalizeRecipientsFromEntities(entities).length>0;}

export function defaultEmailSubject(body:string){const value=body.trim();return value.length<=80?value:"Mensagem do Nexo";}
