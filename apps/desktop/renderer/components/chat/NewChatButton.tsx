import { Plus } from "lucide-react";
export function NewChatButton({disabled,onClick}:{disabled:boolean;onClick:()=>void}){return <button className="newChatButton" disabled={disabled} onClick={onClick}><Plus size={15}/>Novo chat</button>;}
