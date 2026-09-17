import type { OfficeStationId } from "@nexo/shared";
import { NexoDrawer } from "../../components/ui/NexoDrawer";
import { OFFICE_STATIONS } from "../data/office-layout";
import { useOfficeStore } from "../state/office-store";

export function OfficeDetailsDrawer({ open, station, onClose, onNavigate }: { open: boolean; station?: OfficeStationId; onClose: () => void; onNavigate: (page: string) => void }) {
  const state = useOfficeStore();
  const info = station ? OFFICE_STATIONS[station] : undefined;
  return <NexoDrawer open={open} onClose={onClose} eyebrow={info ? "ESTAÇÃO" : "AGENTE NEXO"} title={info?.name ?? "Polvo Nexo"} className="officeDetails">
    {info ? <>
      <span className="stationActivity">{info.icon} {info.activity}</span>
      <p>{info.description}</p>
      <dl><dt>Identificador</dt><dd>{info.id}</dd><dt>Capacidade</dt><dd>{info.capacity} agente(s)</dd><dt>Último estado</dt><dd>{state.stationId === info.id ? state.label : "Sem atividade recente"}</dd></dl>
      {info.targetPage && <button type="button" onClick={() => onNavigate(info.targetPage!)}>Abrir {info.name}</button>}
    </> : <>
      <dl><dt>Estado</dt><dd>{state.state}</dd><dt>Tarefa</dt><dd>{state.runId ?? "Nenhuma"}</dd><dt>Estação</dt><dd>{OFFICE_STATIONS[state.stationId].name}</dd><dt>Atividade</dt><dd>{state.label}</dd></dl>
      {state.runId && <button type="button" className="dangerGhost" onClick={() => void window.nexo.cancelTask(state.runId!)}>Cancelar tarefa</button>}
    </>}
  </NexoDrawer>;
}
