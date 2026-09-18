import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/desktop/dist");
const manifestPath = path.join(root, "renderer-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = Object.entries(manifest);
const byKey = new Map(entries);
const byteCache = new Map();

async function compressedSize(file) {
  if (!byteCache.has(file)) {
    const contents = await readFile(path.join(root, file));
    byteCache.set(file, { raw: contents.byteLength, gzip: gzipSync(contents, { level: 9 }).byteLength });
  }
  return byteCache.get(file);
}

async function collectClosure(entryKey, visited = new Set()) {
  if (visited.has(entryKey)) return visited;
  visited.add(entryKey);
  const entry = byKey.get(entryKey);
  if (!entry) throw new Error(`Chave ausente no manifest: ${entryKey}`);
  for (const imported of entry.imports ?? []) await collectClosure(imported, visited);
  return visited;
}

async function measure(keys) {
  const files = new Set();
  for (const key of keys) {
    const entry = byKey.get(key);
    if (entry?.file) files.add(entry.file);
    for (const css of entry?.css ?? []) files.add(css);
  }
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const size = await compressedSize(file);
    raw += size.raw;
    gzip += size.gzip;
  }
  return { files: [...files], raw, gzip };
}

const entryKey = entries.find(([key, entry]) => entry.isEntry && (key === "index.html" || entry.src === "index.html"))?.[0];
if (!entryKey) throw new Error("O build não declarou a entrada index.html no manifest.");

const initialFiles = await collectClosure(entryKey);
const initial = await measure(initialFiles);
const dynamicEntries = entries.filter(([, entry]) => entry.isDynamicEntry);
const lazy = [];
for (const [key, entry] of dynamicEntries) {
  if (key.includes("node_modules")) continue;
  const result = await measure(new Set([key]));
  lazy.push({ name: entry.name ?? path.basename(entry.file ?? key), ...result });
}
lazy.sort((a, b) => b.gzip - a.gzip);

const format = value => `${(value / 1024).toFixed(1)} KiB`;
console.log(`Renderer inicial (JS + CSS estáticos): ${format(initial.raw)} bruto · ${format(initial.gzip)} gzip`);
console.log("Maiores chunks carregados sob demanda (tamanho individual; não soma dependências compartilhadas):");
for (const chunk of lazy.slice(0, 12)) console.log(`  ${chunk.name}: ${format(chunk.raw)} bruto · ${format(chunk.gzip)} gzip`);

const initialBudget = 150 * 1024;
const oversizedLazy = lazy.filter(chunk => chunk.gzip > 300 * 1024);
if (initial.gzip > initialBudget) {
  console.error(`Falha: renderer inicial excede o orçamento de ${format(initialBudget)} gzip.`);
  process.exitCode = 1;
}
if (oversizedLazy.length) {
  console.warn(`Atenção: ${oversizedLazy.length} grupo(s) lazy excedem 300 KiB gzip; avalie a necessidade da dependência e sua estratégia de carregamento.`);
}
