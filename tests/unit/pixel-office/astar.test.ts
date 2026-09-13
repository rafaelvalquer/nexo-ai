import { describe, expect, it } from "vitest";
import { Grid } from "../../../apps/desktop/renderer/pixel-office/navigation/Grid";
import { findPath } from "../../../apps/desktop/renderer/pixel-office/navigation/AStar";
describe("Pixel Office A*", () => {
  it("encontra uma rota transitável entre mesa e corredor", () => {
    const grid = new Grid(), path = findPath(grid, { x: 17, y: 16 }, { x: 23, y: 11 });
    expect(path.length).toBeGreaterThan(1);
    expect(path.every(point => grid.isWalkable(point))).toBe(true);
  });
  it("recusa destino bloqueado", () => {
    expect(findPath(new Grid(), { x: 17, y: 16 }, { x: 17, y: 14 })).toEqual([]);
  });
  it("mantém o orçamento médio de navegação abaixo de 10 ms", () => {
    const grid = new Grid(), started = performance.now();
    for (let i = 0; i < 250; i++) expect(findPath(grid, { x: 17, y: 16 }, { x: 23, y: 11 }).length).toBeGreaterThan(0);
    expect((performance.now() - started) / 250).toBeLessThan(10);
  });
});

