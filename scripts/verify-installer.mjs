import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const installer = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "release", `NexoAI-Setup-${version}.exe`);
const blockmap = `${installer}.blockmap`;

if (!fs.existsSync(installer)) throw new Error(`Instalador não encontrado: ${installer}`);
const stat = fs.statSync(installer);
if (stat.size < 10 * 1024 * 1024) throw new Error(`Instalador inesperadamente pequeno: ${stat.size} bytes.`);
const header = fs.readFileSync(installer, { encoding: null, flag: "r" }).subarray(0, 2).toString("ascii");
if (header !== "MZ") throw new Error("O artefato não possui cabeçalho PE/Windows (MZ).");
if (!fs.existsSync(blockmap) || fs.statSync(blockmap).size < 100) throw new Error("Blockmap do instalador está ausente ou inválido.");
console.log(`Instalador validado: ${path.basename(installer)} (${stat.size} bytes)`);
