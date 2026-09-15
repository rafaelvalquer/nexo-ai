import type { EmailService } from "../../../email/service.js";
import type { ExecutionRecord } from "../execution-record-repository.js";
import type { MutationReconciler, ReconciliationResult } from "./reconciler.js";

/** Provider send APIs do not expose a stable request key yet; ambiguity is preserved instead of guessed. */
export class EmailSendReconciler implements MutationReconciler {
  constructor(private readonly email: EmailService) {}
  supports(record: ExecutionRecord) { return record.toolName === "email_send" || record.toolName === "email_send_composed"; }
  async reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult> {
    if (signal?.aborted) throw signal.reason;
    const input = record.input as { connectionId?: string; message?: { connectionId?: string; subject?: string }; subject?: string };
    const connectionId = input.connectionId ?? input.message?.connectionId;
    const subject = input.subject ?? input.message?.subject;
    if (!connectionId || !subject) return { status: "still_unknown", reason: "Envio sem identificadores suficientes para reconciliação." };
    try {
      const result = await this.email.search({ connectionId, query: `in:sent subject:\"${subject.replace(/\"/g, "")}\"`, maxResults: 10 }, signal);
      if (result.messages.length === 1) return { status: "confirmed_success", result: { ok: true, summary: "Envio confirmado na pasta de enviados.", data: { messageId: result.messages[0].id } } };
      return { status: "still_unknown", reason: result.messages.length ? "Mais de um envio corresponde ao assunto; não é seguro escolher um." : "O provedor ainda não confirmou o envio." };
    } catch (error) { return { status: "still_unknown", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
