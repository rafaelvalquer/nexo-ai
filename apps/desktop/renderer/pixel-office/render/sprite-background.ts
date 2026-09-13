/** Remove only light neutral pixels connected to the outside of an atlas cell.
 * Interior whites (eyes, reflections) remain enclosed by the dark outline.
 * This also handles older exported sprites with an opaque checkerboard matte.
 */
export function clearExteriorMatte(data: Uint8ClampedArray, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const visit = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const neutral = Math.min(r, g, b) > 110 && Math.max(r, g, b) - Math.min(r, g, b) < 42;
    if (data[offset + 3] === 0 || neutral) {
      data[offset + 3] = 0;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
}
