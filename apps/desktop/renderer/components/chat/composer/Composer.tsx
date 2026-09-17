import { useCallback, useRef, useState } from "react";
import { FileText, Globe2, Paperclip, Send, Square, Zap } from "lucide-react";
import type { AssistantAttachment } from "../../../stores/assistant";
import { useAutoGrowTextarea } from "../../../hooks/useAutoGrowTextarea";
import { useChatKeyboard } from "../../../hooks/useChatKeyboard";
import { AttachmentTray } from "./AttachmentTray";

const slashCommands = [
  { command: "/web", label: "Pesquisar na Web", icon: Globe2 },
  { command: "/file", label: "Analisar um documento", icon: FileText },
  { command: "/macro", label: "Criar uma macro", icon: Zap },
  { command: "/open", label: "Abrir um aplicativo ou pasta", icon: Paperclip },
  { command: "/run", label: "Executar uma tarefa", icon: Send }
];

function expandCommand(value: string) {
  const [command, ...rest] = value.trim().split(/\s+/);
  const query = rest.join(" ");
  const prefix: Record<string, string> = {
    "/web": "Pesquise na web",
    "/file": "Analise o documento",
    "/macro": "Crie uma macro",
    "/open": "Abra",
    "/run": "Execute"
  };
  return prefix[command.toLowerCase()] ? `${prefix[command.toLowerCase()]}${query ? `: ${query}` : ""}` : value;
}

export function Composer({ attachments, busy, onAttach, onRemove, onSend, onStop }: { attachments: AssistantAttachment[]; busy: boolean; onAttach: () => void; onRemove: (id: string) => void; onSend: (value: string) => Promise<boolean>; onStop: () => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(ref, text);
  const stop = useCallback(() => onStop(), [onStop]);
  useChatKeyboard(ref, stop);
  const pending = attachments.some(item => item.status !== "ready");
  const commandQuery = text.startsWith("/") && !text.includes(" ") ? text.toLowerCase() : null;
  const suggestions = commandQuery === null ? [] : slashCommands.filter(item => item.command.startsWith(commandQuery));
  const send = async () => {
    if (await onSend(expandCommand(text))) {
      setText("");
      requestAnimationFrame(() => ref.current?.focus());
    }
  };
  const useCommand = (command: string) => {
    setText(`${command} `);
    requestAnimationFrame(() => ref.current?.focus());
  };
  return <footer className="composerDock"><div className="chatColumn"><div className="composer"><AttachmentTray items={attachments} onRemove={onRemove}/><textarea ref={ref} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => {
    if (event.key === "Escape" && suggestions.length) { event.preventDefault(); setText(""); return; }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (suggestions.length) useCommand(suggestions[0].command); else void send(); }
  }} placeholder={busy ? "Nexo está executando… você pode continuar digitando" : "Peça algo ao Nexo… (digite / para comandos)"} rows={1} aria-label="Mensagem para o Nexo" aria-expanded={suggestions.length > 0}/>
    {suggestions.length > 0 && <div className="slashMenu" role="listbox" aria-label="Comandos rápidos">{suggestions.map(({ command, label, icon: Icon }) => <button key={command} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => useCommand(command)}><Icon size={15}/><span><b>{command}</b><small>{label}</small></span></button>)}</div>}
    <div className="composerToolbar"><button className="iconButton" onClick={onAttach} aria-label="Anexar documentos"><Paperclip size={18}/><span>Documento</span></button><span className="contextIndicator"><i className="dot"/>Local</span>{busy ? <button className="stopButton" onClick={onStop} aria-label="Parar geração"><Square size={15}/></button> : <button className="sendButton" onClick={() => void send()} disabled={!text.trim() || pending} aria-label="Enviar mensagem"><Send size={17}/></button>}</div></div><small className="composerHint">Enter para enviar · Shift + Enter para nova linha · Ctrl + L para focar</small></div></footer>;
}
