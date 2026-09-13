import type { ConnectionService } from "../connections/service.js";
import type { EmailDraft, EmailDraftInput, EmailMessage, EmailSearchQuery, EmailSearchResult, EmailModifyAction, EmailAttachment, EmailMailboxStats } from "./types.js";
import { GoogleApiClient } from "../google/api-client.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

export class EmailService {
  private readonly google:GoogleApiClient;
  constructor(private connections:ConnectionService){this.google=new GoogleApiClient(connections);}

  async search(input:EmailSearchQuery,signal?:AbortSignal):Promise<EmailSearchResult>{
    const account=this.requireAccount(input.connectionId);
    if(account.provider==="google")return searchGoogle(this.google,input,signal);
    const token=await this.connections.accessToken(account.id,"email.read");
    return searchMicrosoft(token,input,signal);
  }

  async latest(connectionId:string,signal?:AbortSignal):Promise<EmailMessage|null>{
    const result=await this.search({connectionId,query:"in:inbox",maxResults:1},signal);
    return result.messages[0]??null;
  }

  async stats(connectionId:string,signal?:AbortSignal):Promise<EmailMailboxStats>{
    const account=this.requireAccount(connectionId);
    if(account.provider==="google"){
      const [profile,inbox,unread]=await Promise.all([
        this.google.json<any>(connectionId,"email.read","https://gmail.googleapis.com/gmail/v1/users/me/profile",{},signal),
        this.google.json<any>(connectionId,"email.read","https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",{},signal),
        this.google.json<any>(connectionId,"email.read","https://gmail.googleapis.com/gmail/v1/users/me/labels/UNREAD",{},signal)
      ]);
      return{totalMessages:numberOrUndefined(profile.messagesTotal),totalThreads:numberOrUndefined(profile.threadsTotal),inboxMessages:numberOrUndefined(inbox.messagesTotal),unreadMessages:numberOrUndefined(unread.messagesTotal??unread.messagesUnread)};
    }
    const token=await this.connections.accessToken(connectionId,"email.read");
    const response=await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount",{headers:{Authorization:`Bearer ${token}`},signal});
    if(!response.ok)throw new Error(`Não foi possível consultar as estatísticas do Microsoft Graph (HTTP ${response.status}).`);
    const data=await response.json() as any;
    return{inboxMessages:numberOrUndefined(data.totalItemCount),unreadMessages:numberOrUndefined(data.unreadItemCount)};
  }

  async getMessage(connectionId:string,messageId:string,signal?:AbortSignal):Promise<EmailMessage>{
    const account=this.requireAccount(connectionId);
    if(account.provider==="google"){
      const item=await this.google.json<any>(connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,{},signal);
      return normalizeGoogleMessage(item);
    }
    const token=await this.connections.accessToken(connectionId,"email.read");
    const response=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,isRead,hasAttachments,conversationId`,{headers:{Authorization:`Bearer ${token}`},signal});
    if(!response.ok)throw new Error(`Não foi possível obter o e-mail no Microsoft Graph (HTTP ${response.status}).`);
    return normalizeMicrosoftMessage(await response.json());
  }

  async getThread(connectionId:string,threadId:string,signal?:AbortSignal):Promise<EmailMessage[]>{
    const account=this.requireAccount(connectionId);
    if(account.provider==="google"){
      const data=await this.google.json<any>(connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,{},signal);
      return(data.messages??[]).map(normalizeGoogleMessage);
    }
    const token=await this.connections.accessToken(connectionId,"email.read");
    const response=await fetch(`https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId%20eq%20'${encodeURIComponent(threadId)}'&$orderby=receivedDateTime%20asc`,{headers:{Authorization:`Bearer ${token}`},signal});
    if(!response.ok)throw new Error(`Não foi possível obter a conversa no Microsoft Graph (HTTP ${response.status}).`);
    const data=await response.json() as any;
    return(data.value??[]).map(normalizeMicrosoftMessage);
  }

  async listAttachments(connectionId:string,messageId:string,signal?:AbortSignal):Promise<EmailAttachment[]>{
    const account=this.requireAccount(connectionId);
    if(account.provider==="google"){
      const data=await this.google.json<any>(connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,{},signal);
      return gmailAttachments(data.payload);
    }
    const token=await this.connections.accessToken(connectionId,"email.read");
    const response=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments`,{headers:{Authorization:`Bearer ${token}`},signal});
    if(!response.ok)throw new Error(`Não foi possível listar anexos no Microsoft Graph (HTTP ${response.status}).`);
    const data=await response.json() as any;
    return(data.value??[]).map((item:any)=>({id:item.id,name:item.name??"anexo",contentType:item.contentType,size:item.size}));
  }

  async downloadAttachment(connectionId:string,messageId:string,attachmentId:string,destination:string,signal?:AbortSignal){
    const account=this.requireAccount(connectionId);
    let bytes:Buffer;
    if(account.provider==="google"){
      const data=await this.google.json<any>(connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,{},signal);
      bytes=Buffer.from(data.data??"","base64url");
    }else{
      const token=await this.connections.accessToken(connectionId,"email.read");
      const response=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,{headers:{Authorization:`Bearer ${token}`},signal});
      if(!response.ok)throw new Error(`Não foi possível baixar o anexo no Microsoft Graph (HTTP ${response.status}).`);
      bytes=Buffer.from(await response.arrayBuffer());
    }
    if(!bytes.length)throw new Error("O anexo não possui conteúdo para salvar.");
    await fs.writeFile(destination,bytes,{flag:"wx"});
    return{destination,size:bytes.length};
  }

  async createDraft(input:EmailDraftInput):Promise<EmailDraft>{
    const account=this.requireAccount(input.connectionId);
    await this.connections.accessToken(account.id,"email.send");
    return{id:randomUUID(),provider:account.provider,message:input};
  }

  async modify(connectionId:string,messageId:string,action:EmailModifyAction,value?:string,signal?:AbortSignal){
    const account=this.requireAccount(connectionId);
    if(account.provider==="google"){
      await modifyGoogle(this.google,connectionId,messageId,action,value,signal);
      return{ok:true,provider:"google",action};
    }
    const token=await this.connections.accessToken(connectionId,"email.modify");
    const response=await modifyMicrosoft(token,messageId,action,value,signal);
    if(!response.ok)throw new Error(`O Microsoft Graph recusou a alteração do e-mail (HTTP ${response.status}).`);
    return{ok:true,provider:"microsoft",action};
  }

  async sendDraft(draft:EmailDraft,signal?:AbortSignal){
    if(draft.provider==="google"){
      const payload=[`To: ${draft.message.to.map(x=>x.email).join(", ")}`,`Subject: ${draft.message.subject}`,"",draft.message.bodyText].join("\r\n");
      const raw=Buffer.from(payload).toString("base64url");
      await this.google.request(draft.message.connectionId,"email.send","https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({raw})},signal);
      return{ok:true,provider:"google"};
    }
    const token=await this.connections.accessToken(draft.message.connectionId,"email.send");
    const response=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({message:{subject:draft.message.subject,body:{contentType:"Text",content:draft.message.bodyText},toRecipients:draft.message.to.map(x=>({emailAddress:{address:x.email,name:x.name}})),ccRecipients:draft.message.cc?.map(x=>({emailAddress:{address:x.email,name:x.name}}))},saveToSentItems:true}),signal});
    if(!response.ok)throw new Error(`O Microsoft Graph recusou o envio (HTTP ${response.status}).`);
    return{ok:true,provider:"microsoft"};
  }

  private requireAccount(connectionId:string){const account=this.connections.get(connectionId);if(!account)throw new Error("Conexão não encontrada.");return account;}
}

async function searchGoogle(client:GoogleApiClient,input:EmailSearchQuery,signal?:AbortSignal):Promise<EmailSearchResult>{
  const query=new URLSearchParams({maxResults:String(Math.min(input.maxResults??20,50)),q:[input.unread?"is:unread":"",input.query??""].filter(Boolean).join(" ")});
  if(input.pageToken)query.set("pageToken",input.pageToken);
  const listedData=await client.json<any>(input.connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,{},signal);
  const messages=listedData.messages??[];
  const hydrated=await Promise.all(messages.slice(0,20).map(async({id}:any)=>{
    const item=await client.json<any>(input.connectionId,"email.read",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,{},signal);
    const headers=Object.fromEntries((item.payload?.headers??[]).map((h:any)=>[String(h.name).toLowerCase(),h.value]));
    return{id:item.id,provider:"google",threadId:item.threadId,from:{email:headers.from??""},to:[{email:headers.to??""}],subject:headers.subject??"(sem assunto)",receivedAt:new Date(Number(item.internalDate)).toISOString(),snippet:item.snippet,isUnread:(item.labelIds??[]).includes("UNREAD"),hasAttachments:false} satisfies EmailMessage;
  }));
  return{messages:hydrated,nextPageToken:listedData.nextPageToken,total:listedData.resultSizeEstimate};
}

async function searchMicrosoft(token:string,input:EmailSearchQuery,signal?:AbortSignal):Promise<EmailSearchResult>{
  const params=new URLSearchParams({"$top":String(Math.min(input.maxResults??20,50)),"$select":"id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments","$orderby":"receivedDateTime desc"});
  if(input.unread)params.set("$filter","isRead eq false");
  if(input.query?.trim())params.set("$search",`\"${input.query.trim().replace(/\"/g,"")}\"`);
  const url=input.pageToken?trustedGraphNextLink(input.pageToken):`https://graph.microsoft.com/v1.0/me/messages?${params}`;
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,...(input.query?.trim()?{ConsistencyLevel:"eventual"}:{})},signal});
  if(!response.ok)throw new Error(`Não foi possível consultar o Microsoft Graph (HTTP ${response.status}).`);
  const data=await response.json() as any;
  return{messages:(data.value??[]).map(normalizeMicrosoftMessage),nextPageToken:data["@odata.nextLink"],total:data["@odata.count"]};
}

async function modifyGoogle(client:GoogleApiClient,connectionId:string,id:string,action:EmailModifyAction,value?:string,signal?:AbortSignal){
  if(action==="trash"){await client.request(connectionId,"email.modify",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/trash`,{method:"POST"},signal);return;}
  if((action==="move"||action==="add_label"||action==="remove_label")&&!value)throw new Error("Informe o marcador ou destino do e-mail.");
  const body=action==="mark_read"?{removeLabelIds:["UNREAD"]}:action==="mark_unread"?{addLabelIds:["UNREAD"]}:action==="archive"?{removeLabelIds:["INBOX"]}:action==="flag"?{addLabelIds:["STARRED"]}:action==="move"?{removeLabelIds:["INBOX"],addLabelIds:[value!]}:action==="add_label"?{addLabelIds:[value!]}:{removeLabelIds:[value!]};
  await client.request(connectionId,"email.modify",`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},signal);
}

async function modifyMicrosoft(token:string,id:string,action:EmailModifyAction,value?:string,signal?:AbortSignal){
  const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"},base=`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`;
  if(action==="mark_read"||action==="mark_unread")return fetch(base,{method:"PATCH",headers,body:JSON.stringify({isRead:action==="mark_read"}),signal});
  if(action==="flag")return fetch(base,{method:"PATCH",headers,body:JSON.stringify({flag:{flagStatus:"flagged"}}),signal});
  if(action==="add_label"||action==="remove_label"){
    if(!value)throw new Error("Informe a categoria do e-mail.");
    const current=await fetch(`${base}?$select=categories`,{headers,signal});if(!current.ok)return current;
    const categories=((await current.json() as any).categories??[]) as string[],next=action==="add_label"?[...new Set([...categories,value])]:categories.filter(category=>category!==value);
    return fetch(base,{method:"PATCH",headers,body:JSON.stringify({categories:next}),signal});
  }
  const destinationId=action==="archive"?"archive":action==="move"?value:"deleteditems";if(!destinationId)throw new Error("Informe a pasta de destino do e-mail.");
  return fetch(`${base}/move`,{method:"POST",headers,body:JSON.stringify({destinationId}),signal});
}

function trustedGraphNextLink(value:string){const url=new URL(value);if(url.origin!=="https://graph.microsoft.com"||!url.pathname.startsWith("/v1.0/me/messages"))throw new Error("Página de e-mail inválida.");return url.toString();}
function normalizeGoogleMessage(item:any):EmailMessage{const headers=Object.fromEntries((item.payload?.headers??[]).map((h:any)=>[String(h.name).toLowerCase(),h.value]));return{id:item.id,provider:"google",threadId:item.threadId,from:{email:headers.from??""},to:[{email:headers.to??""}],cc:headers.cc?[{email:headers.cc}]:undefined,subject:headers.subject??"(sem assunto)",receivedAt:new Date(Number(item.internalDate)).toISOString(),snippet:item.snippet,bodyText:decodeGmailBody(item.payload),isUnread:(item.labelIds??[]).includes("UNREAD"),hasAttachments:(item.payload?.parts??[]).some((part:any)=>Boolean(part.filename))};}
function normalizeMicrosoftMessage(item:any):EmailMessage{return{id:item.id,provider:"microsoft",threadId:item.conversationId,from:{email:item.from?.emailAddress?.address??"",name:item.from?.emailAddress?.name},to:(item.toRecipients??[]).map((x:any)=>({email:x.emailAddress.address,name:x.emailAddress.name})),cc:(item.ccRecipients??[]).map((x:any)=>({email:x.emailAddress.address,name:x.emailAddress.name})),subject:item.subject??"(sem assunto)",receivedAt:item.receivedDateTime,snippet:item.bodyPreview,bodyText:item.body?.content,isUnread:!item.isRead,hasAttachments:item.hasAttachments};}
function decodeGmailBody(payload:any):string|undefined{const parts=flattenParts(payload),part=parts.find((item:any)=>item.mimeType?.startsWith("text/plain")&&item.body?.data);return part?.body?.data?Buffer.from(part.body.data,"base64url").toString("utf8"):undefined;}
function gmailAttachments(payload:any):EmailAttachment[]{return flattenParts(payload).filter((part:any)=>part.filename&&part.body?.attachmentId).map((part:any)=>({id:part.body.attachmentId,name:part.filename,contentType:part.mimeType,size:part.body.size}));}
function flattenParts(payload:any):any[]{if(!payload)return[];const result=[payload];for(const part of payload.parts??[])result.push(...flattenParts(part));return result;}
function numberOrUndefined(value:unknown){const number=Number(value);return Number.isFinite(number)?number:undefined;}
