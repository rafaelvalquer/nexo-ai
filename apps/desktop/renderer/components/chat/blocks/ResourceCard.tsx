import type { ReactNode } from "react";
import type { ResourceItem } from "@nexo/shared";
export function ResourceCard({item,icon,title,subtitle,description,metadata,children,onExpand,selected,onSelect}:{item:ResourceItem;icon:ReactNode;title:string;subtitle?:string;description?:string;metadata?:ReactNode;children?:ReactNode;onExpand?:()=>void;selected?:boolean;onSelect?:(selected:boolean)=>void}) {
  return <article className={`resourceCard ${selected?"selected":""}`} data-resource-id={item.id}>
    <div className="resourceCardHeader">{onSelect&&<input type="checkbox" checked={selected??false} onChange={event=>onSelect(event.target.checked)} aria-label={`Selecionar ${title}`}/>}<span className="resourceCardIcon">{icon}</span><div className="resourceCardTitle">{onExpand?<button type="button" className="resourceExpand" onClick={onExpand}>{title||"(sem assunto)"}</button>:<h3>{title||"(sem título)"}</h3>}{subtitle&&<span>{subtitle}</span>}</div></div>
    {description&&<p className="resourceCardBody">{description}</p>}{metadata&&<div className="resourceCardMeta">{metadata}</div>}
    {children}{item.statusText&&<p className={`resourceStatus ${item.state??""}`} role="status">{item.statusText}</p>}
  </article>;
}
