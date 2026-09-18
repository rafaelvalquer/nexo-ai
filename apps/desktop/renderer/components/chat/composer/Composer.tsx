import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, Globe2, Paperclip, Send, Sparkles, Square, Zap, type LucideIcon } from "lucide-react";
import type { AutomationViewModel, DocumentRecord, NexoSettings } from "@nexo/shared";
import type { AssistantAttachment } from "../../../stores/assistant";
import { useAutoGrowTextarea } from "../../../hooks/useAutoGrowTextarea";
import { useChatKeyboard } from "../../../hooks/useChatKeyboard";
import { Tooltip } from "../../ui/Tooltip";
import { fuzzyScore } from "../../../utils/fuzzy-score";
import "./composer-tooltips.css";
import { AttachmentTray } from "./AttachmentTray";

const slashCommands = [
  { command: "/web", label: "Pesquisar na Web", icon: Globe2 },
  { command: "/file", label: "Analisar um documento", icon: FileText },
  { command: "/macro", label: "Criar uma macro", icon: Zap },
  { command: "/open", label: "Abrir um aplicativo ou pasta", icon: Paperclip },
  { command: "/run", label: "Executar uma tarefa", icon: Send }
];

type MentionChoice = { id: string; group: "Pastas" | "Documentos" | "Macros"; label: string; detail: string; token: string; icon: LucideIcon; document?: DocumentRecord };

function expandCommand(value: string) {
  const [command, ...rest] = value.trim().split(/\s+/);
  const query = rest.join(" ");
  const prefix: Record<string, string> = { "/web": "Pesquise na web", "/file": "Analise o documento", "/macro": "Crie uma macro", "/open": "Abra", "/run": "Execute" };
  return prefix[command.toLowerCase()] ? `${prefix[command.toLowerCase()]}${query ? `: ${query}` : ""}` : value;
}

export function Composer({ attachments, busy, onAttach, onAttachDocument, onRemove, onSend, onStop }: {
  attachments: AssistantAttachment[];
  busy: boolean;
  onAttach: () => void;
  onAttachDocument: (document: DocumentRecord) => void;
  onRemove: (id: string) => void;
  onSend: (value: string) => Promise<boolean>;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [mentionChoices, setMentionChoices] = useState<MentionChoice[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(true);
  const [mentionContext, setMentionContext] = useState<{ query: string; start: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(ref, text);
  const stop = useCallback(() => onStop(), [onStop]);
  useChatKeyboard(ref, stop);
  const pending = attachments.some(item => item.status !== "ready");

  useEffect(() => {
    let active = true;
    const read = <T,>(load: () => Promise<T>, fallback: T) => Promise.resolve().then(load).catch(() => fallback);
    void Promise.all([
      read<NexoSettings | null>(() => window.nexo.getSettings(), null),
      read<DocumentRecord[]>(() => window.nexo.listRecentDocuments?.() ?? Promise.resolve([]), []),
      read<AutomationViewModel[]>(() => window.nexo.listAutomations?.() ?? Promise.resolve([]), [])
    ]).then(([settings, documents, macros]) => {
      if (!active) return;
      const folders: MentionChoice[] = (settings?.allowedRoots ?? []).map(root => ({
        id: `folder:${root}`, group: "Pastas", label: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root, detail: root,
        token: `pasta:${JSON.stringify(root)}`, icon: FolderOpen
      }));
      const files: MentionChoice[] = documents.map(document => ({
        id: `document:${document.id}`, group: "Documentos", label: document.name, detail: "Documento importado · anexar ao chat",
        token: `documento:${JSON.stringify(document.name)}`, icon: FileText, document
      }));
      const savedMacros: MentionChoice[] = macros.map(macro => ({
        id: `macro:${macro.id}`, group: "Macros", label: macro.name, detail: macro.description || macro.prompt || "Macro salva",
        token: `macro:${JSON.stringify(macro.name)}`, icon: Sparkles
      }));
      setMentionChoices([...folders, ...files, ...savedMacros]);
    }).finally(() => { if (active) setMentionsLoading(false); });
    return () => { active = false; };
  }, []);

  const commandQuery = text.startsWith("/") && !text.includes(" ") ? text.toLowerCase() : null;
  const commandSuggestions = commandQuery === null ? [] : slashCommands.filter(item => item.command.startsWith(commandQuery));
  const mentionSuggestions = useMemo(() => mentionContext === null ? [] : mentionChoices
    .map((item, index) => ({ item, index, score: fuzzyScore(`${item.label} ${item.detail} ${item.group}`, mentionContext.query) }))
    .filter(result => result.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 8)
    .map(result => result.item), [mentionChoices, mentionContext]);
  const mentionMenuOpen = mentionContext !== null;
  const activeCount = mentionMenuOpen ? mentionSuggestions.length : commandSuggestions.length;

  const send = async () => {
    if (await onSend(expandCommand(text))) {
      setText("");
      setMentionContext(null);
      requestAnimationFrame(() => ref.current?.focus());
    }
  };
  const useCommand = (command: string) => {
    setMentionContext(null);
    setText(`${command} `);
    setSelected(0);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const useMention = (choice: MentionChoice) => {
    const cursor = ref.current?.selectionStart ?? text.length;
    const start = mentionContext?.start ?? cursor;
    const marker = `@${choice.token} `;
    const next = `${text.slice(0, start)}${marker}${text.slice(cursor)}`;
    setText(next);
    setMentionContext(null);
    setSelected(0);
    if (choice.document) onAttachDocument(choice.document);
    const nextCursor = start + marker.length;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(nextCursor, nextCursor); });
  };

  return <footer className="composerDock"><div className="chatColumn"><div className="composer">
    <AttachmentTray items={attachments} onRemove={onRemove}/>
    <textarea ref={ref} value={text} onChange={event => {
      const value = event.currentTarget.value;
      const cursor = event.currentTarget.selectionStart ?? value.length;
      const beforeCursor = value.slice(0, cursor);
      const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
      setMentionContext(match ? { query: match[1], start: cursor - match[1].length - 1 } : null);
      setSelected(0);
      setText(value);
    }} onKeyDown={event => {
      if (event.key === "Escape" && mentionMenuOpen) { event.preventDefault(); setMentionContext(null); return; }
      if (event.key === "Escape" && commandSuggestions.length) { event.preventDefault(); setText(""); return; }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && activeCount > 0) {
        event.preventDefault();
        setSelected(index => event.key === "ArrowDown" ? (index + 1) % activeCount : (index - 1 + activeCount) % activeCount);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        if (mentionMenuOpen && mentionSuggestions.length) { event.preventDefault(); useMention(mentionSuggestions[selected] ?? mentionSuggestions[0]); return; }
        if (commandSuggestions.length) { event.preventDefault(); useCommand(commandSuggestions[selected]?.command ?? commandSuggestions[0].command); return; }
        event.preventDefault();
        void send();
      }
    }} placeholder={busy ? "Nexo está executando… você pode continuar digitando" : "Peça algo ao Nexo… (digite / ou @)"} rows={1} aria-label="Mensagem para o Nexo" aria-expanded={mentionMenuOpen || commandSuggestions.length > 0} aria-controls={mentionMenuOpen ? "mention-menu" : commandSuggestions.length ? "slash-menu" : undefined} aria-activedescendant={activeCount ? `${mentionMenuOpen ? "mention" : "slash"}-option-${selected}` : undefined}/>
    {mentionMenuOpen && <div id="mention-menu" className="composerSuggestMenu mentionMenu" role="listbox" aria-label="Contextos disponíveis">
      {mentionSuggestions.length ? mentionSuggestions.map((choice, index) => { const Icon = choice.icon; return <button id={`mention-option-${index}`} key={choice.id} type="button" role="option" aria-selected={selected === index} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setSelected(index)} onClick={() => useMention(choice)}><Icon size={15}/><span><b>{choice.label}</b><small>{choice.group} · {choice.detail}</small></span></button>; }) : <div className="composerSuggestEmpty" role="status">{mentionsLoading ? "Carregando referências locais…" : "Nenhum contexto local encontrado."}</div>}
    </div>}
    {commandSuggestions.length > 0 && !mentionMenuOpen && <div id="slash-menu" className="composerSuggestMenu slashMenu" role="listbox" aria-label="Comandos rápidos">{commandSuggestions.map(({ command, label, icon: Icon }, index) => <button id={`slash-option-${index}`} key={command} type="button" role="option" aria-selected={selected === index} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setSelected(index)} onClick={() => useCommand(command)}><Icon size={15}/><span><b>{command}</b><small>{label}</small></span></button>)}</div>}
    <div className="composerToolbar"><button className="iconButton" onClick={onAttach} aria-label="Anexar documentos"><Paperclip size={18}/><span>Documento</span></button><span className="contextIndicator"><i className="dot"/>Local</span>{busy ? <Tooltip content="Parar geração"><button type="button" className="stopButton" onClick={onStop} aria-label="Parar geração"><Square size={15}/></button></Tooltip> : <Tooltip content="Enviar mensagem"><button type="button" className="sendButton" onClick={() => void send()} disabled={!text.trim() || pending} aria-label="Enviar mensagem"><Send size={17}/></button></Tooltip>}</div>
  </div><small className="composerHint">Enter para enviar · Shift + Enter para nova linha · digite @ para contexto local</small></div></footer>;
}
