import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kind = process.argv[2];
if (!new Set(["patch", "minor", "major"]).has(kind)) throw new Error("Uso: node scripts/release.mjs <patch|minor|major>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = ["package.json", "packages/shared/package.json", "packages/core/package.json", "apps/desktop/package.json"].map(file => path.join(root, file));
const rootManifest = JSON.parse(fs.readFileSync(manifests[0], "utf8")); const [major, minor, patch] = rootManifest.version.split(".").map(Number);
const next = kind === "major" ? `${major + 1}.0.0` : kind === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
for (const file of manifests) { const manifest = JSON.parse(fs.readFileSync(file, "utf8")); manifest.version = next; fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`); }
console.log(`Versão sincronizada: ${next}`);
