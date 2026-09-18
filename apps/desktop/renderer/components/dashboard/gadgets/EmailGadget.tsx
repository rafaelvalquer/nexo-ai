import { useState } from "react";
import { Mail, Paperclip, Reply } from "lucide-react";
import { useAppStore } from "../../../stores/app";
import { NexoDrawer } from "../../ui/NexoDrawer";
import { GadgetLoadingState } from "./GadgetLoadingState";
import { useDeveloperDiagnosticsEnabled } from "../../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../../utils/user-facing-error";
import type {DashboardEmailData} from "@nexo/shared";
import "./gadgets.css";
import "./availability.css";
import "./email-drawer.css";

type Message = {
  id: string;
  threadId?: string;
  from: { name?: string; email: string };
  subject: string;
  snippet?: string;
  receivedAt: string;
  isUnread: boolean;
  hasAttachments: boolean;
};

export function EmailGadget({ data }: { data?: DashboardEmailData }) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const setPage = useAppStore(state => state.setPage);
  const [selected, setSelected] = useState<Message>();
  const [full, setFull] = useState<any>();
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvalId, setApprovalId] = useState<string>();

  async function open(message: Message) {
    if (!data || data.available === false) return;
    setSelected(message);
    setFull(undefined);
    setError("");
    setReplying(false);
    setApprovalId(undefined);
    try {
      setFull(await window.nexo.dashboard.getEmailMessage(data.connectionId, message.id));
    } catch (reason) {
      setError(userFacingError(reason,"Não consegui abrir esse e-mail. Tente novamente.",diagnostics));
    }
  }

  async function send() {
    if (!data || data.available === false) return;
    if (!selected || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (!approvalId) {
        const result = await window.nexo.dashboard.replyEmail({
          connectionId: data.connectionId,
          messageId: selected.id,
          threadId: selected.threadId,
          bodyText: body
        });
        if (result.approvalId) {
          setApprovalId(result.approvalId);
          return;
        }
        if (!result.result?.ok) throw new Error(result.text ?? "Não foi possível preparar a resposta.");
      } else {
        await window.nexo.resolveApproval(approvalId, true);
      }
      setBody("");
      setReplying(false);
      setSelected(undefined);
      setFull(undefined);
      setApprovalId(undefined);
    } catch (reason) {
      setError(userFacingError(reason,"Não foi possível enviar a resposta. Confira o conteúdo e tente novamente.",diagnostics));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReply() {
    if (approvalId) {
      try { await window.nexo.resolveApproval(approvalId, false); } catch { /* Keep the editor usable if the approval already expired. */ }
    }
    setApprovalId(undefined);
    setReplying(false);
  }

  if (!data) {
    return <GadgetLoadingState icon={Mail} label="Caixa de entrada" />;
  }

  if (data.available === false) {
    return <div className="gadgetUnavailable">
      <p className="gadgetEmpty">Conecte ou reautorize uma conta com permissão de leitura de e-mail.</p>
      <button onClick={() => setPage("Configurações")}>Gerenciar conexões</button>
    </div>;
  }

  return <>
    <div className="emailGadget">
      <header><Mail size={14}/><b>Caixa de entrada</b><span>{data.unreadCount} não lidos</span></header>
      {!data.messages?.length ? <p className="gadgetEmpty">Nenhum e-mail encontrado.</p> : data.messages.map((message: Message) =>
        <button className={`emailGadgetRow${message.isUnread ? " unread" : ""}`} key={message.id} onClick={() => void open(message)}>
          <i/><span><b>{message.from.name ?? message.from.email}</b><time>{new Date(message.receivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><strong>{message.subject}</strong><small>{message.snippet}</small></span>
          {message.hasAttachments && <Paperclip size={13}/>}
        </button>
      )}
    </div>
    <NexoDrawer
      open={Boolean(selected)}
      onClose={() => { if (!busy) { if (approvalId) void cancelReply(); setSelected(undefined); } }}
      eyebrow="E-MAIL · PRÉVIA LOCAL"
      title={full?.subject ?? selected?.subject ?? "Mensagem"}
      className="dashboardEmailDrawer"
    >
      {selected && <>
        <div className="emailDrawerMeta">{selected.from.name ?? selected.from.email} · {new Date(selected.receivedAt).toLocaleString("pt-BR")}</div>
        <pre className="emailDrawerBody">{full?.bodyText ?? full?.snippet ?? "Carregando mensagem…"}</pre>
        {error && <p role="alert">{error}</p>}
        {replying ? <form className="emailDrawerReply" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label>Sua resposta<textarea autoFocus value={body} onChange={event => setBody(event.target.value)} maxLength={100000}/></label>
          <small>{approvalId ? "Prévia pronta. Confirme abaixo para autorizar o envio." : `A resposta será enviada para ${selected.from.email}, na conversa original. O Nexo solicitará aprovação antes do envio.`}</small>
          <footer>
            <button type="button" onClick={() => void cancelReply()} disabled={busy}>Cancelar</button>
            <button type="submit" disabled={busy || !body.trim()}>{busy ? "Processando…" : approvalId ? "Aprovar e enviar resposta" : "Revisar resposta"}</button>
          </footer>
        </form> : <footer className="emailDrawerActions"><button type="button" onClick={() => { setBody(""); setReplying(true); }}>Responder <Reply size={14}/></button></footer>}
      </>}
    </NexoDrawer>
  </>;
}
