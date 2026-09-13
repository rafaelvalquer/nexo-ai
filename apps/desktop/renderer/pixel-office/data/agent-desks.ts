import type { Facing, WorldPoint } from "./office-layout";

export type AgentDesk = {
  id: string;
  name: string;
  colorName: string;
  color: number;
  spriteRow: number;
  position: WorldPoint;
  workingFacing: Facing;
  furniture: { x: number; y: number; width: number; height: number };
};

export const AGENT_DESKS: AgentDesk[] = [
  { id: "agent-1", name: "Mesa 1", colorName: "Roxo", color: 0xb879ff, spriteRow: 0, position: { x: 544, y: 512 }, workingFacing: "up", furniture: { x: 440, y: 336, width: 216, height: 160 } },
  { id: "agent-2", name: "Mesa 2", colorName: "Azul", color: 0x43c9ff, spriteRow: 1, position: { x: 960, y: 512 }, workingFacing: "up", furniture: { x: 864, y: 336, width: 212, height: 160 } },
  { id: "agent-3", name: "Mesa 3", colorName: "Verde", color: 0x48e89b, spriteRow: 2, position: { x: 544, y: 736 }, workingFacing: "up", furniture: { x: 440, y: 544, width: 216, height: 160 } },
  { id: "agent-4", name: "Mesa 4", colorName: "Laranja", color: 0xffac47, spriteRow: 3, position: { x: 960, y: 736 }, workingFacing: "up", furniture: { x: 864, y: 544, width: 212, height: 160 } }
];

export function deskForAgent(id: string): AgentDesk {
  return AGENT_DESKS.find(desk => desk.id === id) ?? AGENT_DESKS[0];
}

// Foot positions, with clearance from furniture and the perimeter walls.
export const OFFICE_FLOOR = [
  { x: 320, y: 416 }, { x: 576, y: 320 }, { x: 992, y: 320 },
  { x: 1280, y: 448 }, { x: 1120, y: 704 }, { x: 1088, y: 800 },
  { x: 960, y: 832 }, { x: 608, y: 832 }, { x: 352, y: 672 }
];

export const WANDER_POINTS: WorldPoint[] = [
  { x: 736, y: 352 }, { x: 768, y: 448 }, { x: 736, y: 608 },
  { x: 768, y: 768 }, { x: 640, y: 800 }, { x: 1024, y: 800 },
  { x: 384, y: 512 }, { x: 384, y: 608 }, { x: 1152, y: 480 },
  { x: 1120, y: 608 }
];
