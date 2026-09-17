import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, LoaderCircle, Paperclip, RefreshCw } from "lucide-react";
import type { DocumentRecord } from "@nexo/shared";
import { DocumentPreview } from "../components/documents/DocumentPreview";

type DocumentLoadState = "loading" | "ready" | "empty" | "error" | "stale";

function userFacingError(error: unknown) {
  console.error("Falha ao carregar documentos locais", error);
  return "Não consegui carregar seus documentos locais.";
}

export function Documents() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const documentsRef = useRef<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<DocumentRecord>();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async (initial = false) => {
    if (initial || documentsRef.current.length === 0) setLoadState("loading");
    setLoadError("");
    try {
      const result = await window.nexo.listRecentDocuments();
      const nextDocuments = Array.isArray(result) ? result as DocumentRecord[] : [];
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      setLoadState(nextDocuments.length > 0 ? "ready" : "empty");
    } catch (error) {
      setLoadError(userFacingError(error));
      setLoadState(documentsRef.current.length > 0 ? "stale" : "error");
    }
  }, []);

  useEffect(() => { void reload(true); }, [reload]);

  async function add() {
    if (importing) return;
    setImporting(true);
    setImportError("");
    try {
      await window.nexo.chooseDocument();
      await reload();
    } catch (error) {
      console.error("Falha ao importar documento", error);
      setImportError("Não foi possível importar o documento. Tente novamente.");
    } finally {
      setImporting(false);
    }
  }

  return <div className="documentsPage">
    <header>
      <div><h1>Documentos</h1><p>Arquivos importados e mantidos localmente pelo Nexo.</p></div>
      <button onClick={() => void add()} disabled={importing} aria-busy={importing}>
        {importing ? <LoaderCircle size={16} className="documentsSpinning" aria-hidden="true"/> : <Paperclip size={16} aria-hidden="true"/>}
        {importing ? "Importando…" : "Importar"}
      </button>
    </header>

    {importError && <p className="notice error" role="alert">{importError}</p>}
    {loadState === "stale" && <div className="documentsStaleNotice" role="status">
      <span>{loadError} Exibindo os dados carregados anteriormente.</span>
      <button className="ghost" onClick={() => void reload()}><RefreshCw size={14}/> Atualizar</button>
    </div>}

    {loadState === "loading" && <section className="panel documentsLoading" role="status" aria-label="Carregando documentos">
      <span className="documentsVisuallyHidden">Carregando documentos locais…</span>
      {[0, 1, 2].map(item => <div className="documentsSkeletonRow" key={item} aria-hidden="true"><i/><span><i/><i/></span><i/></div>)}
    </section>}

    {loadState === "error" && <section className="panel documentsLoadError" role="alert">
      <FileText size={22} aria-hidden="true"/><h2>Seus documentos não estão disponíveis</h2>
      <p>{loadError}</p>
      <button onClick={() => void reload()}><RefreshCw size={15}/> Tentar novamente</button>
    </section>}

    {(loadState === "ready" || loadState === "stale") && <section className="panel list" aria-label="Documentos importados">
      {documents.map(document => <div className="row" key={document.id}>
        <div><b><FileText size={16} aria-hidden="true"/> {document.name}</b><span>{document.mimeType} · {(document.sizeBytes / 1024).toFixed(1)} KB</span><small>{document.status}{document.metadata?.chunkCount ? ` · ${document.metadata.chunkCount} trechos indexados` : ""}</small></div>
        <div className="rowActions"><span className={`tag ${document.status === "ready" ? "success" : document.status === "failed" ? "error" : "pending"}`}>{document.status}</span>
          <button className="ghost" onClick={() => setSelected(document)} title="Ver prévia" aria-label={`Ver prévia de ${document.name}`}><Eye size={16}/></button>
          <button className="ghost" onClick={() => void window.nexo.exportDocument(document.id)} title="Exportar cópia" aria-label={`Exportar ${document.name}`}><Download size={16}/></button>
        </div>
      </div>)}
    </section>}

    {loadState === "empty" && <section className="panel documentsEmpty">
      <span className="documentsEmptyIcon"><FileText size={20}/></span><h2>Sua biblioteca começa aqui</h2>
      <p>Importe um arquivo para manter uma cópia local, consultar a prévia e anexá-lo às conversas.</p>
      <button onClick={() => void add()} disabled={importing}><Paperclip size={15}/> Importar documento</button>
    </section>}

    {selected && <DocumentPreview id={selected.id} name={selected.name} onClose={() => setSelected(undefined)}/>}
  </div>;
}
