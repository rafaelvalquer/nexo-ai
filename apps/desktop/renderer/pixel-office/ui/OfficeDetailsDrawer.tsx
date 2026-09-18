import { useEffect, useState } from "react";
import type { OfficeStationId } from "@nexo/shared";
import { NexoDrawer } from "../../components/ui/NexoDrawer";
import { Progress } from "../../components/ui/Progress";
import { OFFICE_STATIONS } from "../data/office-layout";
import { useOfficeStore } from "../state/office-store";

const statusLabels: Record<string, string> = {
  idle: "Disponível", wander: "Disponível", thinking: "Planejando", interpreting: "Entendendo o pedido",
  planning: "Planejando", walking: "Indo para a estação", "executing-tool": "Executando etapa",
  working: "Executando etapa", approval: "Aguardando autorização", "awaiting-approval": "Aguardando autorização",
  responding: "Preparando resposta", success: "Concluído", error: "Atenção necessária", offline: "IA offline", cancelled: "Cancelada"
};

function formatElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function OfficeDetailsDrawer({ open, station, onClose, onNavigate }: { open: boolean; station?: OfficeStationId; onClose: () => void; onNavigate: (page: string) => void }) {
  const state = useOfficeStore();
  const [now, setNow] = useState(() => Date.now());
  const selectedRunId = state.runId ?? state.event?.runId ?? Object.keys(state.runs)[0];
  const currentRun = selectedRunId ? state.runs[selectedRunId] : undefined;
  const active = Boolean(currentRun && !["success", "error", "cancelled"].includes(currentRun.state));
  const startedAt = currentRun?.startedAt ?? state.event?.timestamp;
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedSeconds = Number.isFinite(startedAtMs) ? Math.floor((now - startedAtMs) / 1000) : 0;
  const status = statusLabels[currentRun?.state ?? state.state] ?? "Em andamento";
  const cancellableTaskId = currentRun?.taskId ?? currentRun?.runId ?? state.runId;

  useEffect(() => {
    if (!open || station || !active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, station, active, startedAt]);

  const info = station ? OFFICE_STATIONS[station] : undefined;
  return <NexoDrawer open={open} onClose={onClose} eyebrow={info ? "ESTAÇÃO" : "AGENTE NEXO"} title={info?.name ?? "Polvo Nexo"} className="officeDetails">
    {info ? <>
      <span className="stationActivity">{info.icon} {info.activity}</span>
      <p>{info.description}</p>
      <dl><dt>Identificador</dt><dd>{info.id}</dd><dt>Capacidade</dt><dd>{info.capacity} agente(s)</dd><dt>Último estado</dt><dd>{state.stationId === info.id ? state.label : "Sem atividade recente"}</dd></dl>
      {info.targetPage && <button type="button" onClick={() => onNavigate(info.targetPage!)}>Abrir {info.name}</button>}
    </> : <>
      <dl><dt>Estado</dt><dd><span className={`officeTaskStatus ${active ? "active" : currentRun ? currentRun.state : "idle"}`}>{status}</span></dd><dt>Atividade atual</dt><dd>{currentRun?.label ?? state.label}</dd><dt>Estação</dt><dd>{OFFICE_STATIONS[currentRun?.stationId ?? state.stationId].name}</dd>{active && <><dt>Tempo decorrido</dt><dd>{formatElapsed(elapsedSeconds)}</dd></>}</dl>
      {active && <Progress className="officeTaskProgress" label={`Andamento da tarefa: ${currentRun?.label ?? state.label}`} valueLabel="Em andamento" />}
      {state.developerMode && selectedRunId && <small className="officeTaskTechnicalId">ID da execução: {selectedRunId}</small>}
      {active && cancellableTaskId && <button type="button" className="dangerGhost" onClick={() => void window.nexo.cancelTask(cancellableTaskId)}>Cancelar tarefa</button>}
    </>}
  </NexoDrawer>;
}
