import { AGENT_DESKS } from "./agent-desks";
export type OcclusionBand = { id: string; x: number; y: number; width: number; height: number; sortY: number };
// Exact background pixels avoid independently cut white mattes.
// Sort each whole desk at its front edge, never by horizontal strips.
export const OCCLUSION_BANDS: OcclusionBand[] = AGENT_DESKS.map(desk => ({
  id: desk.id, ...desk.furniture, sortY: desk.furniture.y + desk.furniture.height
}));

