import type { OfficeStationId } from "@nexo/shared";
import { AGENT_DESKS, WANDER_POINTS } from "./agent-desks";

export type Facing = "up" | "down" | "left" | "right";
export type WorldPoint = { x: number; y: number };
export type CameraFocus = { x: number; y: number; zoom: number };
export type OfficeStation = {
  id: OfficeStationId; name: string; activity: string; description: string; icon: string; accent: number;
  x: number; y: number; facing: Facing; workingFacing: Facing; capacity: number;
  slots: WorldPoint[]; cameraFocus: CameraFocus; targetPage?: string;
};
export const OFFICE_WIDTH = 1536;
export const OFFICE_HEIGHT = 1024;
export const GRID_SIZE = 32;

// Event station IDs remain activity categories. All activities share the four
// personal work positions; the renderer routes by agent identity in agent-desks.
function activity(id: OfficeStationId, name: string, label: string, description: string, icon: string, accent: number, targetPage?: string): OfficeStation {
  return { id, name, activity: label, description, icon, accent, targetPage,
    x: 768, y: 608, facing: "up", workingFacing: "up", capacity: 4,
    slots: AGENT_DESKS.map(desk => desk.position), cameraFocus: { x: 768, y: 544, zoom: 1.2 } };
}
export const OFFICE_STATIONS: Record<OfficeStationId, OfficeStation> = {
  "central-desk": activity("central-desk", "Planejamento", "Raciocínio e planejamento", "Interpretação do pedido, planejamento e preparação da resposta na mesa do polvo.", "✦", 0x8f76ff, "Assistente"),
  "document-station": activity("document-station", "Documentos", "Arquivos e documentos", "Leitura, pesquisa, criação e edição de documentos na mesa do polvo.", "▤", 0xbca7ff, "Documentos"),
  "mail-station": activity("mail-station", "E-mail", "Caixa de entrada", "Busca, leitura, organização e preparação de mensagens.", "✉", 0x65d5ff, "Conexões"),
  "calendar-station": activity("calendar-station", "Calendário", "Agenda e compromissos", "Consulta de agenda, criação de eventos e organização do calendário.", "▣", 0xffd166, "Conexões"),
  "browser-station": activity("browser-station", "Navegador", "Pesquisa e navegação", "Pesquisa web e automação do navegador.", "◎", 0x5be1ff),
  "system-station": activity("system-station", "Sistema local", "Computador e comandos", "Processos, arquivos, terminal e ações permitidas no computador.", "⌘", 0x68e6a7, "Atividade"),
  "approval-gate": activity("approval-gate", "Aprovação", "Aguardando autorização", "O polvo aguarda em sua mesa até a operação ser aprovada ou recusada.", "!", 0xffc857, "Aprovações"),
  "rest-area": activity("rest-area", "Livre", "Livre / aguardando trabalho", "Polvos sem tarefas passeiam pelos corredores.", "☕", 0x98a8c8)
};
export const STATION_SLOTS = Object.fromEntries(Object.entries(OFFICE_STATIONS).map(([id, station]) => [id, station.slots])) as Record<OfficeStationId, WorldPoint[]>;
export const AGENT_SPAWNS = Object.fromEntries(AGENT_DESKS.map(desk => [desk.id, desk.position]));
export const IDLE_WANDER_POINTS = WANDER_POINTS;
export function slotFor(_station: OfficeStationId, agentId: string) {
  return AGENT_DESKS.find(desk => desk.id === agentId)?.position ?? AGENT_DESKS[0].position;
}

