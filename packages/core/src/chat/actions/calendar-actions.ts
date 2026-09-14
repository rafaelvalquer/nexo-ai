import { z } from "zod";
import type { ChatActionRegistry } from "./registry.js";
export function registerCalendarActions(registry: ChatActionRegistry) {
  for (const action of ["edit", "delete", "rsvp"] as const) registry.register(`calendar.${action}`, ({request, item, binding}) => {
    if (item.resource.kind !== "calendar") throw new Error("O recurso não é um compromisso.");
    let patch: Record<string, unknown> = {};
    if (action === "rsvp") patch = {response: z.enum(["accept", "tentative", "decline"]).parse(request.values?.response)};
    if (action === "edit") {
      patch = z.object({title: z.string().min(1).optional(), start: z.string().datetime().optional(), end: z.string().datetime().optional(), location: z.string().optional()}).parse(request.values ?? {});
      if (!Object.keys(patch).length) throw new Error("Informe uma alteração para o compromisso.");
      if (Date.parse(String(patch.end ?? item.resource.end)) <= Date.parse(String(patch.start ?? item.resource.start))) throw new Error("O término deve ser posterior ao início.");
    }
    const tool = action === "edit" ? "calendar_update" : `calendar_${action}`;
    return {mutation: true, successText: action === "delete" ? "Compromisso cancelado" : action === "edit" ? "Compromisso atualizado" : "Resposta enviada", steps: [{tool, input: {connectionId: z.string().min(1).parse(binding.input.connectionId), eventId: item.resource.eventId, ...patch}, approval: {domain: "calendar", actionType: action, affectedCount: 1, preview: `${item.resource.title}\n${item.resource.start}\n${JSON.stringify(patch)}`, consequence: action === "delete" ? "Este compromisso será cancelado." : "Este compromisso será atualizado."}}]};
  });
}
