import { describe, expect, it } from "vitest";
import { Grid } from "../../../apps/desktop/renderer/pixel-office/navigation/Grid";
import { findPath } from "../../../apps/desktop/renderer/pixel-office/navigation/AStar";
import { AGENT_DESKS, WANDER_POINTS } from "../../../apps/desktop/renderer/pixel-office/data/agent-desks";

describe("grade do escritório pessoal", () => {
  it("liga cada mesa a todos os destinos de passeio sem passar pela mesa de outro polvo", () => {
    for (const desk of AGENT_DESKS) {
      const grid = new Grid(desk.id), home = grid.toGrid(desk.position.x, desk.position.y);
      expect(grid.isWalkable(home)).toBe(true);
      for (const point of WANDER_POINTS) {
        const destination = grid.toGrid(point.x, point.y);
        const path = findPath(grid, home, destination);
        expect(path.length, `${desk.id} -> ${point.x},${point.y}`).toBeGreaterThan(0);
        expect(path.every(cell => grid.isWalkable(cell))).toBe(true);
      }
      for (const other of AGENT_DESKS.filter(item => item.id !== desk.id)) expect(grid.isWalkable(grid.toGrid(other.position.x, other.position.y))).toBe(false);
    }
  });
  it("bloqueia móveis e paredes, com corredores transitáveis", () => {
    const grid = new Grid();
    for (const point of [{ x: 544, y: 448 }, { x: 960, y: 672 }, { x: 64, y: 64 }]) expect(grid.isWalkable(grid.toGrid(point.x, point.y))).toBe(false);
    expect(grid.isWalkable(grid.toGrid(768, 608))).toBe(true);
    expect(grid.cellSize).toBe(32);
  });
});

