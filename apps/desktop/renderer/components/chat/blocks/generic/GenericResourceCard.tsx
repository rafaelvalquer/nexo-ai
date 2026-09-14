import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import type { GenericResource,ResourceItem } from "@nexo/shared";
import { ResourceCard } from "../ResourceCard";
export function GenericResourceCard({item,resource,children}:{item:ResourceItem;resource:GenericResource;children?:ReactNode}) {
  return <ResourceCard item={item} icon={<Layers size={19}/>} title={resource.title} subtitle={resource.subtitle} description={resource.description} metadata={resource.metadata?.map((entry,index)=><span key={index}>{entry.label}: {entry.value}</span>)}>{children}</ResourceCard>;
}
