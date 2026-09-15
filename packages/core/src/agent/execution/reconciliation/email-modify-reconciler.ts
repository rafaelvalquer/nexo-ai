import type { EmailService } from "../../../email/service.js";
import type { ExecutionRecord } from "../execution-record-repository.js";
import type { MutationReconciler, ReconciliationResult } from "./reconciler.js";

export class EmailModifyReconciler implements MutationReconciler {
  constructor(private readonly email: EmailService) {}
  supports(record: ExecutionRecord) { return record.toolName.startsWith("email_") && !["email_send", "email_send_composed", "email_download_attachment"].includes(record.toolName); }
  async reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult> {
    const input = record.input as { connectionId?: string; messageId?: string; messageIds?: string[] };
    const ids = input.messageIds ?? (input.messageId ? [input.messageId] : []);
    if (!input.connectionId || !ids.length) return { status: "still_unknown", reason: "Mutation de e-mail sem IDs consultáveis." };
    if (!/mark_(un)?read$/.test(record.toolName)) return { status: "still_unknown", reason: "O modelo normalizado do provedor não expõe o estado necessário para confirmar esta mutation." };
    try {
      const rows = await Promise.all(ids.map(id => this.email.getMessage(input.connectionId!, id, signal)));
      const expectedUnread = record.toolName.endsWith("mark_unread");
      return rows.every(row => Boolean(row.isUnread) === expectedUnread)
        ? { status: "confirmed_success", result: { ok: true, summary: "Alteração de leitura confirmada pelo provedor." } }
        : { status: "confirmed_failure" };
    } catch (error) { return { status: "still_unknown", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
