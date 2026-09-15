import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ResourceAction, ResourceItem } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";
const eventSchema = z.object({ id: z.string(), title: z.string(), start: z.string(), end: z.string(), location: z.string().optional(), description: z.string().optional(), meetingUrl: z.string().optional(), allDay: z.boolean().optional() });
export function calendarActions(joinUrl?: string): ResourceAction[] {
  return [
    { id: "calendar.edit", icon: "edit", label: "Editar compromisso", mutation: true },
    { id: "calendar.delete", icon: "trash", label: "Cancelar compromisso", mutation: true },
    ...(joinUrl ? [{ id: "calendar.join", icon: "open", label: "Abrir reunião", mutation: false }] as ResourceAction[] : []),
    { id: "calendar.rsvp", icon: "rsvp", label: "Responder convite", mutation: true },
  ];
}
export const calendarAdapter: PresentationAdapter = (result, context) => {
  const parsed = z.array(eventSchema).safeParse(Array.isArray(result.data) ? result.data : [result.data]);
  if (!parsed.success) return undefined;
  const blockId = randomUUID();
  const items: ResourceItem[] = parsed.data.map(event => {
    const joinUrl = event.meetingUrl && /^https?:\/\//i.test(event.meetingUrl) ? event.meetingUrl : undefined;
    return { id: randomUUID(), resource: { kind: "calendar", eventId: event.id, title: event.title, start: event.start, end: event.end, location: event.location, description: event.description, joinUrl, allDay: event.allDay }, actions: typeof context.input.connectionId === "string" ? calendarActions(joinUrl) : [] };
  });
  return {
    presentation: { version: 1, blocks: [{ id: blockId, version: 1, type: "resource_collection", domain: "calendar", title: "Compromissos",subtitle:items.length?undefined:"Nenhum compromisso encontrado no período.", total: items.length, items }] },
    bindings: items.map(item => ({ blockId, itemId: item.id, toolName: context.toolName, input: { connectionId: context.input.connectionId, eventId: item.resource.kind === "calendar" ? item.resource.eventId : undefined } })),
  };
};
