import { Mail, MailOpen, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import type { EmailResource,ResourceItem } from "@nexo/shared";
import { ResourceCard } from "../ResourceCard";
export function EmailCard({item,resource,children,onExpand,selected,onSelect}:{item:ResourceItem;resource:EmailResource;children:ReactNode;onExpand:()=>void;selected?:boolean;onSelect?:(selected:boolean)=>void}) {
  const date=new Date(resource.receivedAt);
  return <ResourceCard item={item} icon={resource.unread?<Mail size={19}/>:<MailOpen size={19}/>} title={resource.subject} subtitle={`${resource.sender.name?`${resource.sender.name} · `:""}${resource.sender.email}`} description={resource.snippet} metadata={<><time dateTime={resource.receivedAt}>{Number.isNaN(date.getTime())?resource.receivedAt:date.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</time>{resource.unread&&<span className="resourceBadge">Não lido</span>}{resource.hasAttachments&&<span><Paperclip size={12}/> Anexos</span>}</>} onExpand={onExpand} selected={selected} onSelect={onSelect}>{children}</ResourceCard>;
}
