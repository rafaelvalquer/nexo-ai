import { expect, it } from "vitest";
import { clearExteriorMatte } from "../../../apps/desktop/renderer/pixel-office/render/sprite-background";
it("remove matte exterior sem apagar olhos e reflexos brancos encerrados pelo contorno", () => {
  const width = 9, data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    if (x !== 2 && x !== 6 && y !== 2 && y !== 6) continue;
    data.set([20, 10, 40, 255], (y * width + x) * 4);
  }
  clearExteriorMatte(data, width, width);
  expect(data[3]).toBe(0);
  expect(data[(4 * width + 4) * 4 + 3]).toBe(255);
  expect(data[(2 * width + 4) * 4 + 3]).toBe(255);
});

