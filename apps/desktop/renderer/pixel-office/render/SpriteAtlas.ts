import { Texture } from "../pixi-runtime";
import { clearExteriorMatte } from "./sprite-background";

/** Normalize each generated pose to the same height and foot anchor once at load. */
export async function loadSpriteAtlas(url: string): Promise<Texture> {
  const source = new Image();
  source.src = url;
  await source.decode();
  const atlas = document.createElement("canvas");
  atlas.width = atlas.height = 1024;
  const target = atlas.getContext("2d")!;
  target.imageSmoothingEnabled = false;
  const columns = [0, 314, 627, 941, 1254];
  const rows = [0, 344, 636, 928, 1254];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const cell = document.createElement("canvas");
    cell.width = columns[col + 1] - columns[col];
    cell.height = rows[row + 1] - rows[row];
    const context = cell.getContext("2d")!;
    context.drawImage(source, -columns[col], -rows[row]);
    const pixels = context.getImageData(0, 0, cell.width, cell.height);
    clearExteriorMatte(pixels.data, cell.width, cell.height);
    context.putImageData(pixels, 0, 0);
    let left = cell.width, top = cell.height, right = 0, bottom = 0;
    for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
      if (pixels.data[(y * cell.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    const width = right - left + 1, height = bottom - top + 1;
    if (width <= 0 || height <= 0) throw new Error("Sprite do polvo vazio.");
    const scale = Math.min(208 / height, 216 / width);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    target.drawImage(cell, left, top, width, height, col * 256 + Math.round((256 - w) / 2), row * 256 + 240 - h, w, h);
  }
  return Texture.from(atlas);
}
