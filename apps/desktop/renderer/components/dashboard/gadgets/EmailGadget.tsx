import { useState } from "react";
import { Mail, Paperclip, Reply, Trash2 } from "lucide-react";
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

type EmailDrawerAction =
  | { type: "reply"; approvalId?: string }
  | { type: "trash"; approvalId?: string }
  | undefined;

export function EmailGadget({ data, onRefresh }: { data?: DashboardEmailData; onRefresh?: () => Promise<void> | void }) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const setPage = useAppStore(state => state.setPage);
  const [selected, setSelected] = useState<Message>();
  const [full, setFull] = useState<any>();
  const [action, setAction] = useState<EmailDrawerAction>();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open(message: Message) {
    if (!data || data.available === false) return;
    setSelected(message);
    setFull(undefined);
    setError("");
    setAction(undefined);
    setBody("");
    try {
      setFull(await window.nexo.dashboard.getEmailMessage(data.connectionId, message.id));
    } catch (reason) {
      setError(userFacingError(reason,"Não consegui abrir esse e-mail. Tente novamente.",diagnostics));
    }
  }

  async function send() {
    if (!data || data.available === false || action?.type !== "reply") return;
    if (!selected || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (!action.approvalId) {
        const result = await window.nexo.dashboard.replyEmail({
          connectionId: data.connectionId,
          messageId: selected.id,
          threadId: selected.threadId,
          bodyText: body
        });
        if (result.approvalId) {
          setAction({type:"reply",approvalId:result.approvalId});
          return;
        }
        if (!result.result?.ok) throw new Error(result.text ?? "Não foi possível preparar a resposta.");
      } else {
        await window.nexo.resolveApproval(action.approvalId, true);
      }
      setBody("");
      setAction(undefined);
      setSelected(undefined);
      setFull(undefined);
    } catch (reason) {
      setError(userFacingError(reason,"Não foi possível enviar a resposta. Confira o conteúdo e tente novamente.",diagnostics));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAction() {
    if (action?.approvalId) {
      try { await window.nexo.resolveApproval(action.approvalId, false); } catch { /* Approval may already be expired. */ }
    }
    setAction(undefined);
    setBody("");
  }

  async function beginTrash() {
    if (!data || data.available === false || !data.canModify || !selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.nexo.dashboard.trashEmail({
        connectionId: data.connectionId,
        messageId: selected.id
      });
      if (result.approvalId) {
        setAction({type:"trash",approvalId:result.approvalId});
        return;
      }
      if (!result.result?.ok) throw new Error(result.text ?? "Não foi possível preparar a exclusão.");
      await onRefresh?.();
      setAction(undefined);
      setSelected(undefined);
      setFull(undefined);
    } catch (reason) {
      setError(userFacingError(reason,"Não foi possível mover esse e-mail para a lixeira. Verifique a conexão e tente novamente.",diagnostics));
    } finally {
      setBusy(false);
    }
  }

  async function confirmTrash() {
    if (action?.type !== "trash" || !action.approvalId) return;
    setBusy(true);
    setError("");
    try {
      await window.nexo.resolveApproval(action.approvalId, true);
      await onRefresh?.();
      setAction(undefined);
      setSelected(undefined);
      setFull(undefined);
    } catch (reason) {
      setAction({type:"trash"});
      setError(userFacingError(reason,"Não foi possível mover esse e-mail para a lixeira. Verifique a conexão e tente novamente.",diagnostics));
    } finally {
      setBusy(false);
    }
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

  const trashDisabled=!data.canModify||busy;
  const trashTitle=!data.canModify?"Ative a permissão Alterar e-mails nas conexões.":undefined;

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
      onClose={() => { if (!busy) { if (action?.approvalId) void cancelAction(); setSelected(undefined); setFull(undefined); setAction(undefined); } }}
      eyebrow="E-MAIL · PRÉVIA LOCAL"
      title={full?.subject ?? selected?.subject ?? "Mensagem"}
      className="dashboardEmailDrawer"
    >
      {selected && <>
        <div className="emailDrawerMeta">{selected.from.name ?? selected.from.email} · {new Date(selected.receivedAt).toLocaleString("pt-BR")}</div>
        <pre className="emailDrawerBody">{full?.bodyText ?? full?.snippet ?? "Carregando mensagem…"}</pre>
        {error && <p role="alert">{error}</p>}
        {action?.type === "reply" ? <form className="emailDrawerReply" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label>Sua resposta<textarea autoFocus value={body} onChange={event => setBody(event.target.value)} maxLength={100000}/></label>
          <small>{action.approvalId ? "Prévia pronta. Confirme abaixo para autorizar o envio." : `A resposta será enviada para ${selected.from.email}, na conversa original. O Nexo solicitará aprovação antes do envio.`}</small>
          <footer>
            <button type="button" onClick={() => void cancelAction()} disabled={busy}>Cancelar</button>
            <button type="submit" disabled={busy || !body.trim()}>{busy ? "Processando…" : action.approvalId ? "Aprovar e enviar resposta" : "Revisar resposta"}</button>
          </footer>
        </form> : action?.type === "trash" ? <div className="emailDrawerTrashConfirm">
          <p>Este e-mail será movido para a lixeira da sua conta.</p>
          <footer>
            <button type="button" onClick={() => void cancelAction()} disabled={busy}>Cancelar</button>
            <button type="button" className="emailDrawerDanger" onClick={() => action.approvalId ? void confirmTrash() : void beginTrash()} disabled={busy}>
              {busy ? "Processando…" : "Mover para a lixeira"} <Trash2 size={14}/>
            </button>
          </footer>
        </div> : <footer className="emailDrawerActions">
          <button type="button" onClick={() => { setBody(""); setAction({type:"reply"}); }}>Responder <Reply size={14}/></button>
          <button type="button" className="emailDrawerDanger" disabled={trashDisabled} title={trashTitle} onClick={() => void beginTrash()}>
            Excluir <Trash2 size={14}/>
          </button>
        </footer>}
      </>}
    </NexoDrawer>
  </>;
}
