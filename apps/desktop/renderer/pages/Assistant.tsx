import { useRef,useState } from "react";
import { PanelLeft } from "lucide-react";
import { AssistantHeader } from "../components/chat/AssistantHeader";
import { Composer } from "../components/chat/composer/Composer";
import { EmptyState } from "../components/chat/EmptyState";
import { ExecutionDrawer } from "../components/chat/ExecutionDrawer";
import { MessageList } from "../components/chat/MessageList";
import { ScrollToBottom } from "../components/chat/ScrollToBottom";
import { ChatViewport } from "../components/chat/ChatViewport";
import { ChatColumn } from "../components/chat/ChatColumn";
import { WideExecutionRail } from "../components/chat/WideExecutionRail";
import { ChatTabs } from "../components/chat/ChatTabs";
import { useAssistant } from "../hooks/useAssistant";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";
import { NexoDrawer } from "../components/ui/NexoDrawer";
import { Tooltip } from "../components/ui/Tooltip";
import { useAgentEvents } from "../pixel-office/hooks/useAgentEvents";
export function Assistant() {
  useAgentEvents();
  const assistant = useAssistant();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const session = assistant.activeSession;
  const streamRevision = `${assistant.activeTask?.progressText?.length ?? 0}:${assistant.activeTask?.statusHistory?.length ?? 0}:${assistant.activeTask?.statusMessage ?? ""}`;
  const scroll = useChatAutoScroll(viewportRef, {
    sessionId: assistant.activeSessionId,
    messageCount: assistant.messages.length,
    newestMessageId: assistant.messages.at(-1)?.id,
    historyRevision: session?.historyRevision,
    historyLoading: session?.historyLoading,
    streaming: assistant.isStreaming,
    streamRevision,
    pendingApprovalId: assistant.activeTask?.pendingApprovalId
  });
  const send = async (value: string) => {
    const sent = await assistant.send(value);
    if (sent) requestAnimationFrame(() => scroll.scrollToBottom("smooth"));
    return sent;
  };
  const loadOlder = () => {
    scroll.prepareHistoryLoad();
    void assistant.loadOlderMessages(assistant.activeSessionId);
  };
  return <section className="assistantPage assistantMultiPage">
    <div className="assistantMultiLayout">
      <ChatTabs sessions={assistant.sessions} activeId={assistant.activeSessionId}
        onCreate={() => void assistant.createSession()} onSelect={assistant.selectSession}
        onClose={id => void assistant.closeSession(id)} />
      <div className="assistantSessionPanel" id="assistant-active-chat-panel" role="tabpanel" aria-label="Conversa ativa" tabIndex={0}>
        <Tooltip className="mobileChatsTooltip" content="Abrir conversas"><button type="button" className="mobileChatsTrigger" aria-label="Abrir conversas" onClick={() => setChatsOpen(true)}><PanelLeft size={17}/></button></Tooltip>
        <AssistantHeader model={assistant.model} busy={assistant.isStreaming} elapsed={assistant.elapsed} onExecution={() => setDrawerOpen(true)} />
        {session && <div className="activeChatIdentity">
          <span>{session.agentId ? session.agentId.replace("agent-", "Polvo ") : "Agente livre"}</span>
          <b>{session.title}</b>
          {session.status === "waiting_approval" && <em>Aguardando aprovação</em>}
        </div>}
        <ChatViewport ref={viewportRef} onScroll={scroll.onScroll}>
          <ChatColumn>
            {session?.hasMoreHistory && <div className="historyPagination">
              <button type="button" disabled={session.historyLoading} onClick={loadOlder}>
                {session.historyLoading ? "Carregando mensagens…" : session.historyError ? "Tentar carregar mensagens anteriores novamente" : "Carregar mensagens anteriores"}
              </button>
              {session.historyError && <p role="alert">{session.historyError}</p>}
            </div>}
            {assistant.messages.length === 0 && !assistant.activeTask
              ? <EmptyState onPrompt={value => void send(value)} />
              : <MessageList messages={assistant.messages} activeTask={assistant.activeTask} elapsed={assistant.elapsed} error={assistant.error} />}
          </ChatColumn>
        </ChatViewport>
        <ScrollToBottom visible={!scroll.isNearBottom || scroll.hasUnreadBelow} unread={scroll.hasUnreadBelow} onClick={() => scroll.scrollToBottom("smooth")} />
        <Composer attachments={assistant.attachments} busy={assistant.isStreaming} onAttach={assistant.attach}
          onAttachDocument={assistant.attachDocument} onRemove={assistant.removeAttachment} onSend={send} onStop={assistant.stop}
          onDropFiles={files => session ? assistant.attachDroppedFiles(session.id, files) : Promise.resolve()} />
        <ExecutionDrawer task={assistant.activeTask} elapsed={assistant.elapsed} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
      <WideExecutionRail task={assistant.activeTask} elapsed={assistant.elapsed} />
      <NexoDrawer open={chatsOpen} onClose={() => setChatsOpen(false)} eyebrow="ASSISTENTE LOCAL" title="Conversas" side="left" className="mobileChatDrawer">
        <ChatTabs sessions={assistant.sessions} activeId={assistant.activeSessionId} onCreate={() => void assistant.createSession()} onSelect={id => {assistant.selectSession(id);setChatsOpen(false);}} onClose={id => void assistant.closeSession(id)}/>
      </NexoDrawer>
    </div>
  </section>;
}
