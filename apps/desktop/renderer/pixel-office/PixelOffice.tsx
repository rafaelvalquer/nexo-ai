import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import type { OfficeStationId } from "@nexo/shared";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { OfficeToolbar } from "./ui/OfficeToolbar";
import { AgentStatus } from "./ui/AgentStatus";
import { TaskBubble } from "./ui/TaskBubble";
import { ApprovalOverlay } from "./ui/ApprovalOverlay";
import { OfficeDetailsDrawer } from "./ui/OfficeDetailsDrawer";
import { AgentFlowView } from "./ui/AgentFlowView";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";
import "./styles/pixel-office.css";
import "./styles/pixel-office-multi.css";
import "./styles/pixel-office-tokens.css";

const PixelOfficeCanvas = lazy(() => import("./PixelOfficeCanvas").then(module => ({ default: module.PixelOfficeCanvas })));

export function PixelOffice() {
  useAgentEvents({ recordOfficeRestoreMetric: true });
  const setPage = useAppStore(state => state.setPage);
  const selectSession = useAssistantStore(state => state.selectSession);
  const activeCount = useAssistantStore(state => state.sessions.filter(session => session.status === "running" || session.status === "waiting_approval").length);
  const [drawer, setDrawer] = useState<{ open: boolean; station?: OfficeStationId }>({ open: false });
  const [flowVisible, setFlowVisible] = useState(false);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);

  const openAgent = useCallback((_agentId: string, conversationId?: string) => {
    if (conversationId) {
      selectSession(conversationId);
      setPage("Assistente");
    } else {
      setDrawer({ open: true });
    }
  }, [selectSession, setPage]);
  const openStation = useCallback((station: OfficeStationId) => setDrawer({ open: true, station }), []);
  const navigate = useCallback((page: string) => {
    setDrawer({ open: false });
    setPage(page);
  }, [setPage]);

  return <section className={`pixelOfficePage${immersive ? " immersive" : ""}`}>
    <div className="officeViewport">
      <Suspense fallback={<div className="officeCanvas" role="status" aria-label="Carregando visualização do escritório" />}>
        <PixelOfficeCanvas onAgent={openAgent} onStation={openStation} />
      </Suspense>
      <header className="pixelOfficeHeader">
        <div>
          <span className="eyebrow">NEXO · ESCRITÓRIO</span>
          <h1>Pixel Office</h1>
          <p>{activeCount ? `${activeCount} tarefa${activeCount === 1 ? "" : "s"} em andamento · quatro agentes especializados.` : "Veja o Nexo trabalhando. Quatro agentes, cada tarefa no seu lugar."}</p>
        </div>
        <div className="officeHeaderActions">
          <button className="flowToggle" onClick={() => setDrawer({ open: true })} aria-haspopup="dialog">Detalhes do Polvo</button>
          <button className="flowToggle" onClick={() => setFlowVisible(value => !value)} aria-expanded={flowVisible}>{flowVisible ? "Ocultar fluxo" : "Ver fluxo"}</button>
        </div>
      </header>
      <div className="officeToolbarOverlay"><OfficeToolbar immersive={immersive} onToggleImmersive={() => setImmersive(value => !value)} /></div>
      <TaskBubble />
      <ApprovalOverlay onOpenDetails={() => navigate("Aprovações")} />
      {flowVisible && <aside className="officeFlowDrawer"><div className="officeFlowDrawerHeader"><strong>Fluxo textual</strong><button onClick={() => setFlowVisible(false)}>Fechar</button></div><AgentFlowView /></aside>}
      <div className="officeBottomStatus"><AgentStatus /><span className="officeCameraHint">Arraste com Shift para mover · roda do mouse para zoom</span></div>
    </div>
    <OfficeDetailsDrawer open={drawer.open} station={drawer.station} onClose={() => setDrawer({ open: false })} onNavigate={navigate} />
  </section>;
}
