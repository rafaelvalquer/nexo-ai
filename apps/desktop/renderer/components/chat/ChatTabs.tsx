import { useId, type KeyboardEvent } from "react";
import type { ChatSessionState } from "../../stores/assistant";
import { MAX_CHAT_SESSIONS } from "../../stores/assistant";
import { ChatTab } from "./ChatTab";
import { NewChatButton } from "./NewChatButton";
export function ChatTabs({sessions,activeId,onCreate,onSelect,onClose}:{sessions:ChatSessionState[];activeId:string;onCreate:()=>void;onSelect:(id:string)=>void;onClose:(id:string)=>void}) {
  const instanceId=useId().replaceAll(":","");
  const navigate=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    const current=event.target instanceof HTMLElement?event.target.closest<HTMLButtonElement>("[role=tab]"):null;
    if(!current)return;
    const tabs=[...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    if(!tabs.length)return;
    event.preventDefault();
    const index=tabs.indexOf(current);
    const nextIndex=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowDown"?1:-1)+tabs.length)%tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };
  return <aside className="chatTabs"><NewChatButton disabled={sessions.length>=MAX_CHAT_SESSIONS} onClick={onCreate}/><div className="chatTabsList" role="tablist" aria-label="Conversas abertas" aria-orientation="vertical" onKeyDown={navigate}>{sessions.map(session=><ChatTab key={session.id} tabId={`${instanceId}-tab-${encodeURIComponent(session.id)}`} session={session} active={session.id===activeId} onSelect={()=>onSelect(session.id)} onClose={()=>onClose(session.id)}/>)}</div><div className="chatTabsLimit">{sessions.length}/{MAX_CHAT_SESSIONS} chats · tarefas continuam ao trocar</div></aside>;
}
