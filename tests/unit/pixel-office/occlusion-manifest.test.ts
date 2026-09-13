import { describe, expect, it } from "vitest";
import { OCCLUSION_BANDS } from "../../../apps/desktop/renderer/pixel-office/data/occlusion-manifest";
import { AGENT_DESKS } from "../../../apps/desktop/renderer/pixel-office/data/agent-desks";

describe("profundidade das mesas", () => {
  it("recorta somente os quatro móveis e ordena cada um por sua borda frontal", () => {
    expect(OCCLUSION_BANDS).toHaveLength(4);
    for (const desk of AGENT_DESKS) {
      const band = OCCLUSION_BANDS.find(item => item.id === desk.id)!;
      expect(band).toMatchObject(desk.furniture);
      expect(band.sortY).toBeLessThan(desk.position.y);
      expect(band.sortY).toBe(band.y + band.height);
    }
  });
});

