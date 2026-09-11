import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useAppStore } from "../stores/app";

export function Assistant() {
  const [text, setText] = useState("");
  const messages = useAppStore(s => s.assistantMessages);
  const tasks = useAppStore(s => s.assistantTasks);
  const busy = useAppStore(s => s.assistantBusy);
  const error = useAppStore(s => s.assistantError);
  const sendAssistant = useAppStore(s => s.sendAssistant);
  const syncAssistant = useAppStore(s => s.syncAssistant);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void syncAssistant();
  }, [syncAssistant]);

  const activeTask = tasks.find(task => task.type === "assistant-chat" && (task.status === "queued" || task.status === "running"));
  const streamText = activeTask?.progressText ?? "";
  const statusMessage = activeTask?.statusMessage ?? "Processando localmente…";
  const activeAlreadyPersisted = activeTask
    ? messages.some(message => message.role === "assistant" && message.taskId === activeTask.id)
    : false;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streamText ? "auto" : "smooth", block: "end" });
  }, [messages.length, busy, streamText, statusMessage]);

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
      <header>
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
              <div className="liveStatus"><span className="typingDot" />{statusMessage}</div>
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
