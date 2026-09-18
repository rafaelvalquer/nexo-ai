import { useEffect, useState } from "react";
import { NexoDrawer } from "../../components/ui/NexoDrawer";
import { useToastStore } from "../../stores/toast";
import { developerDiagnosticsEnabled } from "../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../utils/user-facing-error";

type ConnectionConfirmation = { title: string; description: string; confirmLabel: string; run: () => Promise<unknown> };

export function ConnectionConfirmationHost() {
  const [request, setRequest] = useState<ConnectionConfirmation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const receive = (event: Event) => setRequest((event as CustomEvent<ConnectionConfirmation>).detail);
    window.addEventListener("nexo:connection-confirmation", receive);
    return () => window.removeEventListener("nexo:connection-confirmation", receive);
  }, []);

  const confirm = async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.run();
      setRequest(null);
      useToastStore.getState().show({ title: "Ação concluída", description: "A alteração de conexão foi aplicada.", tone: "success" });
    } catch (error) {
      useToastStore.getState().show({ title: "Não foi possível concluir", description: userFacingError(error,"Não foi possível concluir essa alteração de conexão. Tente novamente.",developerDiagnosticsEnabled()), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return <NexoDrawer open={Boolean(request)} onClose={() => { if (!busy) setRequest(null); }} eyebrow="CONFIRMAÇÃO DE SEGURANÇA" title={request?.title ?? "Confirmar ação"} className="confirmationDrawer">
    <p>{request?.description}</p>
    <div className="confirmationActions">
      <button type="button" className="ghost" disabled={busy} onClick={() => setRequest(null)}>Cancelar</button>
      <button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>{busy ? "Processando…" : request?.confirmLabel ?? "Confirmar"}</button>
    </div>
  </NexoDrawer>;
}
