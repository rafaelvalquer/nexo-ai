import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/desktop/renderer/assets/pixel-office");
const files = ["maps/nexo-office-personal.png", "sprites/nexo-octopus-colors.png"];
const write = process.argv.includes("--write");

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function parsePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Arquivo não é PNG.");
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > buffer.length) throw new Error("Chunk PNG truncado.");
    chunks.push({ type: buffer.toString("ascii", offset + 4, offset + 8), data: buffer.subarray(offset + 8, offset + 8 + length), raw: buffer.subarray(offset, end) });
    offset = end;
    if (chunks.at(-1).type === "IEND") break;
  }
  const header = chunks.find(chunk => chunk.type === "IHDR")?.data;
  if (!header || header[8] !== 8 || header[9] !== 2 || header[12] !== 0) throw new Error("Esperado PNG RGB de 8 bits, não entrelaçado.");
  if (!chunks.some(chunk => chunk.type === "IEND")) throw new Error("PNG sem IEND.");
  return { chunks, width: header.readUInt32BE(0), height: header.readUInt32BE(4), compressed: Buffer.concat(chunks.filter(chunk => chunk.type === "IDAT").map(chunk => chunk.data)) };
}

function unfilter(png) {
  const stride = png.width * 3;
  const packed = inflateSync(png.compressed);
  if (packed.length !== (stride + 1) * png.height) throw new Error("Dimensão dos dados PNG não corresponde ao cabeçalho.");
  const pixels = Buffer.allocUnsafe(stride * png.height);
  for (let y = 0; y < png.height; y++) {
    const sourceRow = y * (stride + 1);
    const targetRow = y * stride;
    const filter = packed[sourceRow];
    if (filter > 4) throw new Error(`Filtro PNG inválido: ${filter}.`);
    for (let x = 0; x < stride; x++) {
      const raw = packed[sourceRow + 1 + x];
      const left = x >= 3 ? pixels[targetRow + x - 3] : 0;
      const above = y > 0 ? pixels[targetRow - stride + x] : 0;
      const upperLeft = y > 0 && x >= 3 ? pixels[targetRow - stride + x - 3] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
      pixels[targetRow + x] = (raw + predictor) & 255;
    }
  }
  return pixels;
}

function signedMagnitude(value) { return Math.abs(value < 128 ? value : value - 256); }

function filterRow(row, previous) {
  let best;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let filter = 0; filter <= 4; filter++) {
    const encoded = Buffer.allocUnsafe(row.length);
    let score = 0;
    for (let x = 0; x < row.length; x++) {
      const left = x >= 3 ? row[x - 3] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= 3 ? previous[x - 3] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
      const residual = (row[x] - predictor) & 255;
      encoded[x] = residual;
      score += signedMagnitude(residual);
    }
    if (score < bestScore) { bestScore = score; best = { filter, encoded }; }
  }
  return best;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodePng(original, pixels) {
  const stride = original.width * 3;
  const filteredRows = [];
  for (let y = 0; y < original.height; y++) {
    const start = y * stride;
    const row = pixels.subarray(start, start + stride);
    const selected = filterRow(row, y ? pixels.subarray(start - stride, start) : undefined);
    filteredRows.push(Buffer.from([selected.filter]), selected.encoded);
  }
  const compressed = deflateSync(Buffer.concat(filteredRows), { level: 9 });
  const chunks = [];
  let insertedImageData = false;
  for (const chunk of original.chunks) {
    if (chunk.type === "IDAT") {
      if (!insertedImageData) { chunks.push(makeChunk("IDAT", compressed)); insertedImageData = true; }
    } else if (chunk.type !== "IEND") chunks.push(chunk.raw);
  }
  chunks.push(makeChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

for (const relativePath of files) {
  const target = path.join(root, relativePath);
  const originalBytes = await readFile(target);
  const originalPng = parsePng(originalBytes);
  const originalPixels = unfilter(originalPng);
  const candidateBytes = encodePng(originalPng, originalPixels);
  const candidatePng = parsePng(candidateBytes);
  const candidatePixels = unfilter(candidatePng);
  if (!originalPixels.equals(candidatePixels)) throw new Error(`Verificação pixel a pixel falhou: ${relativePath}`);
  const saved = originalBytes.length - candidateBytes.length;
  console.log(`${relativePath}: ${originalBytes.length.toLocaleString()} → ${candidateBytes.length.toLocaleString()} bytes (${saved >= 0 ? "-" : "+"}${Math.abs(saved).toLocaleString()} bytes), pixels idênticos`);
  if (!write || saved <= 0) continue;
  const mode = (await stat(target)).mode;
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, candidateBytes, { mode });
  await rename(temporary, target);
  console.log(`  atualizado com PNG lossless otimizado${write ? "" : " (dry run)"}`);
}

if (!write) console.log("Simulação apenas. Use --write para substituir somente assets cujo PNG lossless fique menor.");
