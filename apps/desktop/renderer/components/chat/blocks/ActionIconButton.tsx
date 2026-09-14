import { Archive, ArrowDownToLine, Check, Copy, Eye, FolderOpen, List, LoaderCircle, Mail, MailOpen, MoreHorizontal, Move, Pencil, Reply, Search, Trash2 } from "lucide-react";
import type { ResourceAction } from "@nexo/shared";
const icons = {reply:Reply,archive:Archive,trash:Trash2,open:FolderOpen,edit:Pencil,move:Move,download:ArrowDownToLine,read:MailOpen,unread:Mail,more:MoreHorizontal,preview:Eye,copy:Copy,search:Search,list:List,rsvp:Check};
export function ActionIconButton({action,busy,onClick}:{action:ResourceAction;busy?:boolean;onClick:()=>void}) {
  const Icon=busy?LoaderCircle:icons[action.icon];
  return <button type="button" className={`resourceActionButton ${action.icon==="trash"?"danger":""} ${busy?"loading":""}`} aria-label={action.label} title={action.label} disabled={action.disabled||busy} onClick={onClick}><Icon size={16}/></button>;
}
