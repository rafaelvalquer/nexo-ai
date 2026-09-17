import type { CalendarService } from "../../../calendar/service.js";
import type { ExecutionRecord } from "../execution-record-repository.js";
import type { MutationReconciler, ReconciliationResult } from "./reconciler.js";

export class CalendarReconciler implements MutationReconciler {
  constructor(private readonly calendar: CalendarService) {}
  supports(record: ExecutionRecord) { return record.toolName.startsWith("calendar_") && record.mutatesState; }
  async reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult> {
    const input = record.input as { connectionId?: string; eventId?: string; title?: string; start?: string; end?: string };
    if (!input.connectionId) return { status: "still_unknown", reason: "Mutation de calendário sem connectionId." };
    try {
      if (input.eventId && record.toolName !== "calendar_delete") {
        const event = await this.calendar.get(input.connectionId, input.eventId, signal);
        const expected = Object.entries({ title: input.title, start: input.start, end: input.end }).filter(([, value]) => value !== undefined);
        return expected.every(([key, value]) => String((event as unknown as Record<string, unknown>)[key]) === String(value))
          ? { status: "confirmed_success", result: { success:true, ok: true, summary: "Estado do compromisso confirmado pelo provedor.", data: event } }
          : { status: "confirmed_failure" };
      }
      if (input.start && input.end && input.title) {
        const matches = (await this.calendar.list(input.connectionId, input.start, input.end, signal)).filter(event => event.title === input.title && event.start === input.start&&event.end===input.end);
        return matches.length === 1 ? { status: "confirmed_success", result: { success:true, ok: true, summary: "Criação do compromisso confirmada.", data: matches[0] } } : { status: "still_unknown", reason: "Não há correspondência única para a criação." };
      }
      return { status: "still_unknown", reason: "Exclusão sem confirmação inequívoca do provedor." };
    } catch (error) { return { status: "still_unknown", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
