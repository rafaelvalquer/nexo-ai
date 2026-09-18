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
    for (const asset of entry?.assets ?? []) files.add(asset);
  }
  let raw = 0;
  let gzip = 0;
  let assets = 0;
  for (const file of files) {
    const size = await compressedSize(file);
    raw += size.raw;
    if (/\.(?:js|css|html)$/i.test(file)) gzip += size.gzip;
    else assets += size.raw;
  }
  return { files: [...files], raw, gzip, assets };
}

const entryKey = entries.find(([key, entry]) => entry.isEntry && (key === "index.html" || entry.src === "index.html"))?.[0];
if (!entryKey) throw new Error("O build não declarou a entrada index.html no manifest.");

const initialFiles = await collectClosure(entryKey);
const initial = await measure(initialFiles);
const dynamicEntries = entries.filter(([, entry]) => entry.isDynamicEntry);
const lazy = [];
for (const [key, entry] of dynamicEntries) {
  if (key.includes("node_modules")) continue;
  const staticClosure = await collectClosure(key);
  const result = await measure(staticClosure);
  const incrementalEntries = new Set([...staticClosure].filter(imported => !initialFiles.has(imported)));
  const incremental = await measure(incrementalEntries);
  lazy.push({ name: entry.name ?? path.basename(entry.file ?? key), ...result, incremental });
}
lazy.sort((a, b) => b.incremental.gzip + b.incremental.assets - a.incremental.gzip - a.incremental.assets);

const format = value => `${(value / 1024).toFixed(1)} KiB`;
console.log(`Renderer inicial (JS + CSS estáticos): ${format(initial.raw)} bruto · ${format(initial.gzip)} gzip`);
console.log("Maiores rotas lazy (bytes incrementais após o shell; assets binários em tamanho real):");
for (const chunk of lazy.slice(0, 12)) console.log(`  ${chunk.name}: +${format(chunk.incremental.gzip)} gzip JS/CSS · +${format(chunk.incremental.assets)} assets · closure ${format(chunk.raw)} bruto`);

const initialBudget = 150 * 1024;
const oversizedLazy = lazy.filter(chunk => chunk.incremental.gzip + chunk.incremental.assets > 300 * 1024);
if (initial.gzip > initialBudget) {
  console.error(`Falha: renderer inicial excede o orçamento de ${format(initialBudget)} gzip.`);
  process.exitCode = 1;
}
if (oversizedLazy.length) {
  console.warn(`Atenção: ${oversizedLazy.length} rota(s) lazy excedem 300 KiB de payload estimado (JS/CSS gzip + assets reais); avalie a necessidade e o carregamento dos assets.`);
}
