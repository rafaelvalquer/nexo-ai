import { useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundTask, DocumentRecord } from "@nexo/shared";
import { Paperclip, Send, Sparkles } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useVisualStore } from "../stores/visual";
import { ExecutionRail } from "../components/ai/ExecutionRail";

export function Assistant() {
  const [text, setText] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [attachment, setAttachment] = useState<{ taskId: string; name: string; status: string; documentId?: string } | null>(null);
  const messages = useAppStore(state => state.assistantMessages);
  const tasks = useAppStore(state => state.assistantTasks);
  const busy = useAppStore(state => state.assistantBusy);
  const error = useAppStore(state => state.assistantError);
  const sendAssistant = useAppStore(state => state.sendAssistant);
  const syncAssistant = useAppStore(state => state.syncAssistant);
  const setVisual = useVisualStore(state => state.set);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void syncAssistant();
  }, [syncAssistant]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!attachment || attachment.documentId || attachment.status === "failed") return;
    const timer = window.setInterval(() => void window.nexo.getTask(attachment.taskId).then((task: BackgroundTask | undefined) => {
      if (task?.status === "completed") { const document = task.result as DocumentRecord; setAttachment(current => current?.taskId === task.id ? { ...current, name: document.name, status: document.status, documentId: document.id } : current); }
      if (task?.status === "failed") setAttachment(current => current?.taskId === task.id ? { ...current, status: "failed" } : current);
    }), 500);
    return () => window.clearInterval(timer);
  }, [attachment]);

  const activeTask = tasks.find(task => task.type === "assistant-chat" && (task.status === "queued" || task.status === "running"));
  const streamText = activeTask?.progressText ?? "";
  const statusMessage = activeTask?.statusMessage ?? "Processando localmente…";
  const statusHistory = activeTask?.statusHistory?.length ? activeTask.statusHistory : [statusMessage];
  useEffect(() => {
    if (error) setVisual("error");
    else if (busy) setVisual(statusMessage.includes("Aguardando") ? "awaiting-approval" : statusMessage.includes("gerando") ? "responding" : "executing-tool", statusMessage);
    else setVisual("idle");
  }, [busy, error, setVisual, statusMessage]);
  const activeAlreadyPersisted = activeTask
    ? messages.some(message => message.role === "assistant" && message.taskId === activeTask.id)
    : false;
  const elapsedSeconds = useMemo(() => {
    if (!activeTask?.startedAt) return 0;
    return Math.max(0, Math.floor((clock - new Date(activeTask.startedAt).getTime()) / 1000));
  }, [activeTask?.startedAt, clock]);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    chat.scrollTo({ top: chat.scrollHeight, behavior: streamText ? "auto" : "smooth" });
  }, [messages.length, busy, streamText, statusMessage, statusHistory.length]);

  async function send() {
    const value = text.trim();
    if (!value || busy || (attachment && !attachment.documentId)) return;
    setText("");
    await sendAssistant(value, attachment?.documentId ? [attachment.documentId] : []);
    setAttachment(null);
  }

  async function attach() {
    const task = await window.nexo.chooseDocument();
    if (task) setAttachment({ taskId: task.id, name: "Documento selecionado", status: "importando" });
  }

  const visibleMessages = messages.length
    ? messages
    : [{
        id: "welcome",
        role: "assistant" as const,
        content: "Sou o Nexo. Posso conversar com a IA local, analisar o sistema, trabalhar com arquivos autorizados e executar ações controladas.",
        createdAt: ""
      }];

  return (
    <div className="assistant">
      <header className="assistantHeader">
        <div>
          <h1>Assistente</h1>
          <p>Comandos locais com execução controlada</p>
        </div>
        {busy && <div className="pill warn"><span className="dot" />Executando em background · {elapsedSeconds}s</div>}
      </header>

      <div className="assistantWorkspace"><div className="chat" ref={chatRef}>
        <div className="messageStack">
          {visibleMessages.map(message => (
            <div key={message.id} className={`msg ${message.role}`}>
              <div className="avatar">{message.role === "assistant" ? <Sparkles size={14} /> : "V"}</div>
              <div className="messageBody">{message.content}</div>
            </div>
          ))}

          {busy && !activeAlreadyPersisted && (
            <div className="msg assistant live-message">
              <div className="avatar"><Sparkles size={14} /></div>
              <div className="messageBody liveBody">
                <div className="processingHeader">
                  <span>Execução local</span>
                  <span>{elapsedSeconds}s</span>
                </div>
                <div className="processingTrail" aria-live="polite">
                  {statusHistory.map((status, index) => {
                    const active = index === statusHistory.length - 1;
                    return (
                      <div className={`processingStep ${active ? "active" : "done"}`} key={`${index}-${status}`}>
                        <span className="processingDot" />
                        <span>{status}{active ? ` · ${elapsedSeconds}s` : ""}</span>
                      </div>
                    );
                  })}
                </div>

                {streamText && (
                  <div className="streamText">{streamText}<span className="streamCursor" aria-hidden="true" /></div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="msg assistant">
              <div className="avatar"><Sparkles size={14} /></div>
              <div className="messageBody">Falha ao sincronizar o Assistente: {error}</div>
            </div>
          )}
        </div>
      </div><ExecutionRail task={activeTask} /></div>

      <div className="composer">
        {attachment && <div className="attachmentChip">{attachment.name} · {attachment.status}<button onClick={() => setAttachment(null)} aria-label="Remover anexo">×</button></div>}
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
        <button onClick={() => void attach()} disabled={busy} aria-label="Anexar documento"><Paperclip size={18} /></button>
        <button onClick={() => void send()} disabled={busy || !text.trim() || !!(attachment && !attachment.documentId)} aria-label="Enviar"><Send size={18} /></button>
      </div>
    </div>
  );
}
