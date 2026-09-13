import type { ChatSessionState } from "../../stores/assistant";
import { MAX_CHAT_SESSIONS } from "../../stores/assistant";
import { ChatTab } from "./ChatTab";
import { NewChatButton } from "./NewChatButton";
export function ChatTabs({sessions,activeId,onCreate,onSelect,onClose}:{sessions:ChatSessionState[];activeId:string;onCreate:()=>void;onSelect:(id:string)=>void;onClose:(id:string)=>void}){return <aside className="chatTabs"><NewChatButton disabled={sessions.length>=MAX_CHAT_SESSIONS} onClick={onCreate}/><div className="chatTabsList">{sessions.map(session=><ChatTab key={session.id} session={session} active={session.id===activeId} onSelect={()=>onSelect(session.id)} onClose={()=>onClose(session.id)}/>)}</div><div className="chatTabsLimit">{sessions.length}/{MAX_CHAT_SESSIONS} chats · tarefas continuam ao trocar</div></aside>;}
