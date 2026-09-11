import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });

console.log("Nexo AI - preparando ambiente...");
try { run("corepack enable"); } catch {}
try { run("corepack prepare pnpm@10.15.1 --activate"); } catch {}
run("pnpm install");
console.log("\nDependências instaladas.");
console.log("Próximo passo: pnpm dev");
