import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = ["package.json", "packages/shared/package.json", "packages/core/package.json", "packages/browser-agent/package.json", "apps/desktop/package.json"];
const versions = manifests.map(file => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  if (typeof manifest.version !== "string") throw new Error(`VERSION_MISMATCH: versão ausente em ${file}`);
  return [file, manifest.version];
});
const expected = versions[0][1];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(expected)) {
  throw new Error(`VERSION_MISMATCH: SemVer inválida no package.json raiz: ${expected}`);
}
const mismatches = versions.filter(([, version]) => version !== expected);
if (mismatches.length) throw new Error(`VERSION_MISMATCH: ${JSON.stringify(versions)}`);

const desktopPath = path.join(root, "apps/desktop/package.json");
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
if (desktop.build?.extraMetadata?.version && desktop.build.extraMetadata.version !== expected) {
  throw new Error(`VERSION_MISMATCH: electron-builder extraMetadata.version=${desktop.build.extraMetadata.version}`);
}
const releaseTag = process.env.GITHUB_REF_NAME ?? process.env.CI_COMMIT_TAG;
if (releaseTag?.startsWith("v") && releaseTag.slice(1) !== expected) throw new Error(`VERSION_MISMATCH: tag ${releaseTag} diverge da versão ${expected}.`);
console.log(`Versão SemVer sincronizada: ${expected} (${versions.length} manifests + metadados electron-builder)`);
