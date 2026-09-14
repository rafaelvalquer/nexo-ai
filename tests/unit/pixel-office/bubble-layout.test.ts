import { expect, it } from "vitest";
import { BubbleLayoutManager } from "../../../apps/desktop/renderer/pixel-office/ui-pixi/BubbleLayoutManager";

it("mantém quatro relatos separados nas margens de uma janela estreita", () => {
  const anchors = [1, 2, 3, 4].map(index => ({ id: `agent-${index}`, x: index % 2 ? 230 : 400, y: index < 3 ? 370 : 460, width: 240, height: 106 }));
  const placements = new BubbleLayoutManager().layout(anchors, 640, 800);
  for (const rect of placements) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + 240).toBeLessThanOrEqual(640);
    expect(rect.y).toBeGreaterThanOrEqual(96);
    expect(rect.y + 106).toBeLessThanOrEqual(720);
    // The map's two working rows remain visible between the docked cards.
    expect(rect.y + 106 < 350 || rect.y > 500).toBe(true);
    for (const other of placements.filter(item => item.id !== rect.id)) {
      expect(rect.x + 240 <= other.x || other.x + 240 <= rect.x || rect.y + 106 <= other.y || other.y + 106 <= rect.y).toBe(true);
    }
  }
});
