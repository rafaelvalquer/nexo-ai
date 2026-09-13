import { AGENT_DESKS, OFFICE_FLOOR } from "../data/agent-desks";
import { GRID_SIZE, OFFICE_HEIGHT, OFFICE_WIDTH } from "../data/office-layout";

export type GridPoint = { x: number; y: number };
function insideFloor(x: number, y: number) {
  let inside = false;
  for (let i = 0, j = OFFICE_FLOOR.length - 1; i < OFFICE_FLOOR.length; j = i++) {
    const a = OFFICE_FLOOR[i], b = OFFICE_FLOOR[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export class Grid {
  readonly cellSize = GRID_SIZE;
  readonly width = OFFICE_WIDTH / GRID_SIZE;
  readonly height = OFFICE_HEIGHT / GRID_SIZE;
  private blocked = new Set<string>();
  constructor(private agentId?: string) {
    // Art and navigation share geometry, with 14px clearance for the feet.
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const wx = x * this.cellSize, wy = y * this.cellSize;
      const furniture = AGENT_DESKS.some(({ furniture: f }) =>
        wx >= f.x - 14 && wx <= f.x + f.width + 14 && wy >= f.y + 80 - 14 && wy <= f.y + f.height + 14);
      if (!insideFloor(wx, wy) || furniture) this.blocked.add(`${x}:${y}`);
    }
  }
  isWalkable(point: GridPoint) {
    const otherDesk = this.agentId && AGENT_DESKS.some(desk => desk.id !== this.agentId &&
      desk.position.x === point.x * this.cellSize && desk.position.y === point.y * this.cellSize);
    return !otherDesk && point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height && !this.blocked.has(`${point.x}:${point.y}`);
  }
  neighbors(point: GridPoint) { return [{ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }].filter(candidate => this.isWalkable(candidate)); }
  toGrid(x: number, y: number) { return { x: Math.max(0, Math.min(this.width - 1, Math.round(x / this.cellSize))), y: Math.max(0, Math.min(this.height - 1, Math.round(y / this.cellSize))) }; }
  toWorld(point: GridPoint) { return { x: point.x * this.cellSize, y: point.y * this.cellSize }; }
  toggle(point: GridPoint) { const key = `${point.x}:${point.y}`; this.blocked.has(key) ? this.blocked.delete(key) : this.blocked.add(key); }
  blockedCells() { return [...this.blocked].map(key => { const [x, y] = key.split(":").map(Number); return { x, y }; }); }
}

