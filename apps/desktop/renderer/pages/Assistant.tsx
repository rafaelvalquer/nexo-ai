import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useAppStore } from "../stores/app";

export function Assistant() {
  const [text, setText] = useState("");
  const messages = useAppStore(state => state.assistantMessages);
  const tasks = useAppStore(state => state.assistantTasks);
  const busy = useAppStore(state => state.assistantBusy);
  const error = useAppStore(state => state.assistantError);
  const sendAssistant = useAppStore(state => state.sendAssistant);
  const syncAssistant = useAppStore(state => state.syncAssistant);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void syncAssistant();
  }, [syncAssistant]);

  const activeTask = tasks.find(task => task.type === "assistant-chat" && (task.status === "queued" || task.status === "running"));
  const streamText = activeTask?.progressText ?? "";
  const statusMessage = activeTask?.statusMessage ?? "Processando localmente…";
  const statusHistory = activeTask?.statusHistory?.length
    ? activeTask.statusHistory
    : [statusMessage];
  const activeAlreadyPersisted = activeTask
    ? messages.some(message => message.role === "assistant" && message.taskId === activeTask.id)
    : false;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streamText ? "auto" : "smooth", block: "end" });
  }, [messages.length, busy, streamText, statusMessage, statusHistory.length]);

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    await sendAssistant(value);
  }

  const visibleMessages = messages.length
    ? messages
    : [{
        id: "welcome",
        role: "assistant" as const,
        content: "Sou o Nexo. Posso analisar o sistema, pesquisar arquivos e executar ações dentro das pastas permitidas.",
        createdAt: ""
      }];

  return (
    <div className="assistant">
      <header className="assistantHeader">
        <div>
          <h1>Assistente</h1>
          <p>Comandos locais com execução controlada</p>
        </div>
        {busy && <div className="pill warn"><span className="dot" />Executando em background</div>}
      </header>

      <div className="chat">
        {visibleMessages.map(message => (
          <div key={message.id} className={`msg ${message.role}`}>
            <div className="avatar">{message.role === "assistant" ? <Sparkles size={16} /> : "V"}</div>
            <div className="messageBody">{message.content}</div>
          </div>
        ))}

        {busy && !activeAlreadyPersisted && (
          <div className="msg assistant live-message">
            <div className="avatar"><Sparkles size={16} /></div>
            <div className="messageBody liveBody">
              <div className="processingLabel">Processamento local</div>
              <div className="processingTrail" aria-live="polite">
                {statusHistory.map((status, index) => (
                  <div className={`processingStep ${index === statusHistory.length - 1 ? "active" : "done"}`} key={`${index}-${status}`}>
                    <span className="processingDot" />
                    <span>{status}</span>
                  </div>
                ))}
              </div>

              {streamText ? (
                <div className="streamText">{streamText}<span className="streamCursor" aria-hidden="true" /></div>
              ) : (
                <div className="liveHint">A tarefa continua no Core mesmo se você navegar para outra área.</div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="msg assistant">
            <div className="avatar"><Sparkles size={16} /></div>
            <div className="messageBody">Falha ao sincronizar o Assistente: {error}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={busy ? "Uma tarefa está em execução…" : "Peça algo ao Nexo…"}
        />
        <button onClick={() => void send()} disabled={busy || !text.trim()}><Send size={18} /></button>
      </div>
    </div>
  );
}
