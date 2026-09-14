import { File } from "lucide-react";
import type { ReactNode } from "react";
import type { FileResource,ResourceItem } from "@nexo/shared";
import { ResourceCard } from "../ResourceCard";
export function FileCard({item,resource,children,onExpand}:{item:ResourceItem;resource:FileResource;children:ReactNode;onExpand:()=>void}) {
  const size=resource.size===undefined?undefined:resource.size<1024?`${resource.size} B`:resource.size<1048576?`${(resource.size/1024).toFixed(1)} KB`:`${(resource.size/1048576).toFixed(1)} MB`;
  return <ResourceCard item={item} icon={<File size={19}/>} title={resource.name} subtitle={resource.path} metadata={<>{resource.extension?.toUpperCase()}{size&&` · ${size}`}</>} onExpand={onExpand}>{children}</ResourceCard>;
}
