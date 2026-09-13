import { useRef,useState } from "react";
import { AssistantHeader } from "../components/chat/AssistantHeader";
import { Composer } from "../components/chat/composer/Composer";
import { EmptyState } from "../components/chat/EmptyState";
import { ExecutionDrawer } from "../components/chat/ExecutionDrawer";
import { MessageList } from "../components/chat/MessageList";
import { ScrollToBottom } from "../components/chat/ScrollToBottom";
import { useAssistant } from "../hooks/useAssistant";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";
import { AssistantShell } from "../components/chat/AssistantShell";
import { ChatViewport } from "../components/chat/ChatViewport";
import { ChatColumn } from "../components/chat/ChatColumn";
import { WideExecutionRail } from "../components/chat/WideExecutionRail";

export function Assistant(){
  const assistant=useAssistant();const viewportRef=useRef<HTMLDivElement>(null);const[drawerOpen,setDrawerOpen]=useState(false);
  const scroll=useChatAutoScroll(viewportRef,`${assistant.messages.length}:${assistant.activeTask?.progressText?.length??0}:${assistant.activeTask?.statusMessage??""}`,assistant.isStreaming);
  const send=async(value:string)=>{const sent=await assistant.send(value);if(sent)requestAnimationFrame(()=>scroll.anchorLatestUser("smooth"));return sent;};
  return <AssistantShell>
    <AssistantHeader model={assistant.model} busy={assistant.isStreaming} elapsed={assistant.elapsed} onExecution={()=>setDrawerOpen(true)}/>
    <ChatViewport ref={viewportRef} onScroll={scroll.onScroll}><ChatColumn>{assistant.messages.length===0&&!assistant.activeTask?<EmptyState onPrompt={value=>void send(value)}/>:<MessageList messages={assistant.messages} activeTask={assistant.activeTask} elapsed={assistant.elapsed} error={assistant.error}/>}</ChatColumn></ChatViewport>
    <ScrollToBottom visible={!scroll.isNearBottom||scroll.hasUnreadBelow} unread={scroll.hasUnreadBelow} onClick={()=>scroll.scrollToBottom("smooth")}/>
    <Composer attachments={assistant.attachments} busy={assistant.isStreaming} onAttach={()=>void assistant.attach()} onRemove={assistant.removeAttachment} onSend={send} onStop={assistant.stop}/>
    <WideExecutionRail task={assistant.activeTask} elapsed={assistant.elapsed}/>
    <ExecutionDrawer task={assistant.activeTask} elapsed={assistant.elapsed} open={drawerOpen} onClose={()=>setDrawerOpen(false)}/>
  </AssistantShell>;
}
