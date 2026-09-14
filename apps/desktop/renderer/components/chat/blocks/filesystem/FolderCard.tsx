import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import type { FileResource,ResourceItem } from "@nexo/shared";
import { ResourceCard } from "../ResourceCard";
export function FolderCard({item,resource,children,onExpand}:{item:ResourceItem;resource:FileResource;children:ReactNode;onExpand:()=>void}) {
  return <ResourceCard item={item} icon={<FolderOpen size={19}/>} title={resource.name} subtitle={resource.path} metadata={resource.childCount===undefined?undefined:`${resource.childCount} itens`} onExpand={onExpand}>{children}</ResourceCard>;
}
