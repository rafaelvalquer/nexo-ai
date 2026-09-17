import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "package.json",
  "packages/shared/package.json",
  "packages/core/package.json",
  "packages/browser-agent/package.json",
  "apps/desktop/package.json"
];
const versions = files.map(file => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  if (typeof manifest.version !== "string") throw new Error(`Versão ausente em ${file}`);
  return [file, manifest.version];
});
const expected = versions[0][1];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(expected)) {
  throw new Error(`Versão SemVer inválida no package.json raiz: ${expected}`);
}
const invalid = versions.filter(([, version]) => version !== expected);
if (invalid.length) throw new Error(`Versões divergentes: ${JSON.stringify(versions)}`);

const releaseTag = process.env.GITHUB_REF_NAME;
if (releaseTag?.startsWith("v") && releaseTag.slice(1) !== expected) {
  throw new Error(`Tag ${releaseTag} diverge da versão dos manifests (${expected}).`);
}
console.log(`Versão SemVer sincronizada: ${expected}`);
