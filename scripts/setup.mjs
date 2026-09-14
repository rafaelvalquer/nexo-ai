import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });

console.log("Nexo AI - preparando ambiente...");
try { run("corepack enable"); } catch {}
try { run("corepack prepare pnpm@10.15.1 --activate"); } catch {}
run("pnpm install");

const modelfile = path.resolve("models/intent/Modelfile");
if (fs.existsSync(modelfile)) {
  try {
    execSync("ollama --version", { stdio: "ignore", shell: true });
    console.log("\nCriando/atualizando modelo local nexo-intent...");
    run(`ollama create nexo-intent -f "${modelfile}"`);
    console.log("Modelo nexo-intent pronto. Para usá-lo explicitamente, defina NEXO_INTENT_MODEL=nexo-intent.");
  } catch {
    console.log("\nOllama não está disponível durante o setup; o Nexo usará o modelo principal para intenção até o nexo-intent ser criado.");
  }
}

console.log("\nDependências instaladas.");
console.log("Próximo passo: pnpm dev");
