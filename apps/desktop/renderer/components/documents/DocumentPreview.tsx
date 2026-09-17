import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { NexoDrawer } from "../ui/NexoDrawer";

type DocumentVersion = { id: string; version: number; changeSummary?: string; createdAt: string };

export function DocumentPreview({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [pdf, setPdf] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setLoading(true);
    setError(undefined);
    setPdf(undefined);
    void Promise.all([window.nexo.documentPreviewData(id), window.nexo.listDocumentVersions(id)])
      .then(async ([preview, nextVersions]: any) => {
        if (!active) return;
        setVersions(nextVersions);
        const { mimeType, data } = preview;
        const bytes = new Uint8Array(data.data ?? data);
        if (mimeType === "application/pdf") {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
          setPdf(objectUrl);
          return;
        }
        if (mimeType.includes("wordprocessingml")) {
          if (!host.current) throw new Error("A área de pré-visualização não está disponível.");
          await renderAsync(bytes.buffer, host.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true });
          return;
        }
        throw new Error("A pré-visualização interna está disponível para PDF e DOCX.");
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar a pré-visualização.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  async function replaceText() {
    if (!find.trim() || saving) return;
    setSaving(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const task = await window.nexo.editDocument(id, {
        documentId: id,
        rationale: `Substituir “${find.trim()}”`,
        operations: [{ type: "replace_text", find: find.trim(), replace }]
      });
      const done = await window.nexo.getTask(task.id);
      if (done?.status === "completed") {
        setVersions(await window.nexo.listDocumentVersions(id));
        setNotice("Nova versão criada. Use Exportar para salvar a cópia editada.");
      } else {
        setNotice("A alteração foi colocada em processamento.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar uma nova versão.");
    } finally {
      setSaving(false);
    }
  }

  return <NexoDrawer open title={name} eyebrow="PRÉVIA LOCAL" onClose={onClose} className="documentPreviewDrawer">
    <div className="documentPreviewContent">
      <div className="documentPreviewControls">
        <p className="documentVersionLabel">{versions.length ? `Versão ${versions[0].version}` : "Documento original"}</p>
        <div className="editBar">
          <input aria-label="Texto a substituir" value={find} onChange={event => setFind(event.target.value)} placeholder="Texto a substituir" />
          <input aria-label="Novo texto" value={replace} onChange={event => setReplace(event.target.value)} placeholder="Novo texto" />
          <button onClick={() => void replaceText()} disabled={saving || !find.trim()}>{saving ? "Aplicando…" : "Criar nova versão"}</button>
        </div>
        {versions.length > 0 && <section className="documentVersionHistory" aria-label="Histórico de versões"><b>Histórico de versões</b><ul>{versions.map(version => <li key={version.id}>v{version.version} · {version.changeSummary ?? "Alteração"} · {new Date(version.createdAt).toLocaleString("pt-BR")}</li>)}</ul></section>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="documentPreviewViewer">
        {!pdf && <div className="docxFrame" ref={host} hidden={loading || Boolean(error)} />}
        {pdf && <iframe className="pdfFrame" src={pdf} title={`Prévia de ${name}`} />}
        {loading && <div className="documentPreviewLoading" role="status">Carregando prévia…</div>}
      </div>
    </div>
  </NexoDrawer>;
}
