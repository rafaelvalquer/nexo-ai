#!/usr/bin/env node
import { runBrowserToolCallingDiagnostic } from "./lib/browser-tool-call-diagnostic.mjs";

const args = parseArgs(process.argv.slice(2));
const model = args.model ?? process.env.NEXO_BROWSER_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
const ollamaUrl = args.url ?? process.env.NEXO_OLLAMA_URL ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const timeoutMs = Number(args.timeout ?? process.env.NEXO_BROWSER_DIAGNOSTIC_TIMEOUT_MS ?? 20_000);

if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
  console.error(JSON.stringify({ ok:false, error:"timeout deve ser um número >= 1000 ms" }, null, 2));
  process.exit(2);
}

const result = await runBrowserToolCallingDiagnostic({
  model,
  ollamaUrl,
  timeoutMs
});

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--model") result.model = values[++index];
    else if (value === "--url") result.url = values[++index];
    else if (value === "--timeout") result.timeout = values[++index];
  }
  return result;
}
