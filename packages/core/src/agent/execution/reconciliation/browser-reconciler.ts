import fs from "node:fs/promises";
import type { BrowserSessionManager } from "../../../browser/browser-session-manager.js";
import type { ExecutionRecord } from "../execution-record-repository.js";
import type { MutationReconciler, ReconciliationResult } from "./reconciler.js";

export class BrowserReconciler implements MutationReconciler {
  constructor(private readonly sessions: BrowserSessionManager) {}
  supports(record: ExecutionRecord) { return record.toolName.startsWith("browser_") && record.mutatesState; }
  async reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult> {
    if (signal?.aborted) throw signal.reason;
    if (record.toolName === "browser_screenshot" && typeof record.input.path === "string") {
      try { const stat = await fs.stat(record.input.path); return stat.size > 0 ? { status: "confirmed_success", result: { ok: true, summary: "Captura confirmada no filesystem." } } : { status: "confirmed_failure" }; } catch { return { status: "confirmed_failure" }; }
    }
    if (record.toolName === "browser_close") {
      const pages = await this.sessions.pages(record.runId ?? "default").catch(() => []);
      return pages.length === 0 ? { status: "confirmed_success", result: { ok: true, summary: "Sessão do navegador confirmada como fechada." } } : { status: "confirmed_failure" };
    }
    return { status: "still_unknown", reason: "Cliques e digitação não possuem evidência durável suficiente para confirmação automática." };
  }
}
