import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPackage } from "@electron/asar";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const installer = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "release", `NexoAI-Setup-${version}.exe`);
const blockmap = `${installer}.blockmap`;
const unpacked = path.join(path.dirname(installer), "win-unpacked");
const appExe = path.join(unpacked, "NexoAI.exe");
const appAsar = path.join(unpacked, "resources", "app.asar");
function readHeader(file){const descriptor=fs.openSync(file,"r");try{const bytes=Buffer.alloc(2);fs.readSync(descriptor,bytes,0,bytes.length,0);return bytes.toString("ascii");}finally{fs.closeSync(descriptor);}}

if (!fs.existsSync(installer)) throw new Error(`Instalador não encontrado: ${installer}`);
const stat = fs.statSync(installer);
if (stat.size < 10 * 1024 * 1024) throw new Error(`Instalador inesperadamente pequeno: ${stat.size} bytes.`);
const header = readHeader(installer);
if (header !== "MZ") throw new Error("O artefato não possui cabeçalho PE/Windows (MZ).");
if (!fs.existsSync(blockmap) || fs.statSync(blockmap).size < 100) throw new Error("Blockmap do instalador está ausente ou inválido.");
for(const [label,file] of [["executável Electron da aplicação",appExe],["resources/app.asar",appAsar],["resources.pak",path.join(unpacked,"resources.pak")],["ICU data",path.join(unpacked,"icudtl.dat")]]){
  if(!fs.existsSync(file))throw new Error(`Pacote Windows sem ${label}: ${file}`);
}
for(const [label,file] of [["instalador",installer],["aplicação desempacotada",appExe]])if(readHeader(file)!=="MZ")throw new Error(`${label} não possui cabeçalho PE/Windows.`);
const archiveEntries=new Set(listPackage(appAsar).map(entry=>entry.replaceAll("\\","/")));
const requiredEntries=["/dist/index.html","/dist-electron/main/index.js","/dist-electron/preload/index.cjs","/dist-electron/browser-agent-worker.js","/node_modules/@nexo/core/dist/index.js"];
const missing=requiredEntries.filter(entry=>!archiveEntries.has(entry));
if(missing.length)throw new Error(`app.asar incompleto; faltam: ${missing.join(", ")}`);
console.log(`Instalador e payload validados: ${path.basename(installer)} (${stat.size} bytes), PE/Windows, blockmap, Electron, Core, preload, renderer e Browser Agent empacotados.`);
