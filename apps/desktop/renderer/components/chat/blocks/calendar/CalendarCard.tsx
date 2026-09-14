import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import type { CalendarResource,ResourceItem } from "@nexo/shared";
import { ResourceCard } from "../ResourceCard";
export function CalendarCard({item,resource,children}:{item:ResourceItem;resource:CalendarResource;children:ReactNode}) {
  const date=(value:string)=>{const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:parsed.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});};
  return <ResourceCard item={item} icon={<CalendarDays size={19}/>} title={resource.title} subtitle={`${date(resource.start)} — ${date(resource.end)}`} description={resource.description} metadata={resource.location}>{children}</ResourceCard>;
}
