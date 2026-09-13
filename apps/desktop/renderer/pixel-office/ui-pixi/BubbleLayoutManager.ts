export type BubbleAnchor = { id: string; x: number; y: number; width: number; height: number };
export type BubblePlacement = { id: string; x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => !(a.x + a.width + 8 <= b.x || b.x + b.width + 8 <= a.x || a.y + a.height + 8 <= b.y || b.y + b.height + 8 <= a.y);
export class BubbleLayoutManager {
  layout(items: BubbleAnchor[], viewportWidth: number, viewportHeight: number): BubblePlacement[] {
    const placed: Rect[] = [], result: BubblePlacement[] = [];
    for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const maxX = Math.max(8, viewportWidth - item.width - 8);
      const minY = Math.min(96, Math.max(8, viewportHeight - item.height - 80));
      const maxY = Math.max(minY, viewportHeight - item.height - 80);
      const preferred = { x: Math.max(8, Math.min(maxX, item.x - item.width / 2)), y: Math.max(minY, Math.min(maxY, item.y - item.height - 8)), width: item.width, height: item.height };
      let rect = preferred;
      if (placed.some(other => overlaps(preferred, other))) {
        let distance = Infinity;
        for (let y = minY; y <= maxY; y += 12) for (let x = 8; x <= maxX; x += 16) {
          const candidate = { ...preferred, x, y };
          const score = Math.hypot(x - preferred.x, y - preferred.y);
          if (score < distance && !placed.some(other => overlaps(candidate, other))) { rect = candidate; distance = score; }
        }
      }
      placed.push(rect);
      result.push({ id: item.id, x: rect.x, y: rect.y });
    }
    return result;
  }
}

