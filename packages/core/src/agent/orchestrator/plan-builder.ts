import type { ConversationActionContextState } from "../context/conversation-action-context.js";
import { selectedPreviousEmailIds, selectedPreviousEventIds } from "../context/conversation-action-context.js";
import type { AgentIntent, ApprovalPlanMetadata, DeferredAction } from "./intent-schema.js";
import type { AgentToolDescriptor } from "./tool-catalog.js";
import { describeDomainTools } from "./tool-catalog.js";
import { addMinutes, resolveDateTime, resolvePeriod } from "./temporal-resolver.js";

export type BuiltPlanStep = { tool: string; input: Record<string, unknown>; explanation?: string; approval?: ApprovalPlanMetadata };
export type BuiltIntentPlan = {
  steps?: BuiltPlanStep[];
  direct?: string;
  directStream?: boolean;
  deferredAction?: DeferredAction;
  responseMode?: "synthesize" | "deterministic";
};

export function buildIntentPlan(intent: AgentIntent, tools: AgentToolDescriptor[], previous?: ConversationActionContextState): BuiltIntentPlan {
  if (intent.status === "needs_clarification") return { direct: intent.question ?? "Preciso de mais detalhes antes de continuar." };
  if (intent.domain === "general" && intent.intent === "answer") return { directStream: true };
  if (intent.intent === "help") return { direct: describeDomainTools(intent.domain, tools) };
  if (intent.domain === "email") return buildEmailPlan(intent, tools, previous);
  if (intent.domain === "calendar") return buildCalendarPlan(intent, tools, previous);
  return { directStream: true };
}

function buildEmailPlan(intent: AgentIntent, tools: AgentToolDescriptor[], previous?: ConversationActionContextState): BuiltIntentPlan {
  const entities = intent.entities as Record<string, unknown>;
  const previousIds = intent.referencesPreviousResult ? selectedPreviousEmailIds(previous, intent.reference) : [];
  const sender = stringValue(entities.sender ?? entities.from);
  const query = stringValue(entities.query) ?? (sender ? `from:${sender}` : undefined);
  const unread = boolValue(entities.unread);
  const maxResults = numberValue(entities.maxResults ?? entities.limit, 20, 1, 50);

  if (intent.intent === "stats") return readStep("email_stats", {}, "Consultando as estatísticas da sua conta…", tools);

  if (intent.intent === "read" && /latest|ultimo|último|most_recent/.test(intent.operation) && maxResults === 1) {
    return readStep("email_latest", {}, "Buscando o e-mail mais recente…", tools);
  }

  if (["read", "list", "search", "summarize"].includes(intent.intent)) {
    if (previousIds.length) {
      return readStep("email_get_many", { messageIds: previousIds.slice(0, 30) }, "Carregando os e-mails selecionados da conversa…", tools, "synthesize");
    }
    return readStep("email_search", { query, unread, maxResults }, intent.intent === "summarize" ? "Buscando os e-mails que serão resumidos…" : "Consultando os e-mails…", tools, "synthesize");
  }

  if (intent.intent === "send" || /send|compose/.test(intent.operation)) {
    const recipients = stringArray(entities.to ?? entities.recipients ?? entities.recipient);
    const body = stringValue(entities.body ?? entities.message ?? entities.text);
    let subject = stringValue(entities.subject);
    if (!recipients.length) return { direct: "Qual é o endereço de e-mail do destinatário?" };
    if (!body) return { direct: `Qual mensagem você quer enviar para ${recipients.join(", ")}?` };
    if (!subject) subject = body.length <= 80 ? body.trim().replace(/^./, char => char.toUpperCase()) : "Mensagem do Nexo";
    const input = { to: recipients.map(email => ({ email })), subject, bodyText: body };
    return writeStep("email_send_composed", input, "Preparando o e-mail para sua confirmação…", tools, {
      domain: "email", actionType: "send", preview: `Para: ${recipients.join(", ")}\nAssunto: ${subject}\n\n${body}`,
      affectedCount: recipients.length, consequence: "O e-mail será enviado em seu nome.", expiresInMs: 10 * 60_000
    });
  }

  if (["delete", "update", "move"].includes(intent.intent)) {
    const action = emailMutation(intent);
    if (!action) return { direct: "Não consegui determinar qual alteração você quer fazer nos e-mails." };
    if (previousIds.length) {
      const selected = filterPreviousEmailIds(previousIds, previous, sender);
      if (!selected.length) return { direct: "Nenhum e-mail do resultado anterior corresponde ao filtro informado." };
      return bulkEmailWrite(action, selected, sender, tools);
    }
    const search = readStepOnly("email_search", { query, unread, maxResults: Math.max(maxResults, 20) }, "Localizando exatamente os e-mails que podem ser alterados…", tools);
    if (!search) return unavailable("email_search");
    return { steps: [search], deferredAction: { kind: "email.bulk", action, sender }, responseMode: "deterministic" };
  }

  return { direct: "Não consegui mapear essa solicitação para uma operação segura de e-mail." };
}

function buildCalendarPlan(intent: AgentIntent, tools: AgentToolDescriptor[], previous?: ConversationActionContextState): BuiltIntentPlan {
  const entities = intent.entities as Record<string, unknown>;
  const period = entities.period ?? entities.dateRange ?? entities.date ?? "today";
  const range = resolvePeriod(typeof period === "object" && period ? (period as any).kind ?? "today" : period, new Date(), entities.dayPart);
  const query = stringValue(entities.query ?? entities.title);

  if (["list", "read", "search", "summarize"].includes(intent.intent)) {
    return readStep("calendar_list", { start: range.start, end: range.end }, `Consultando sua agenda para ${range.label}…`, tools, "synthesize");
  }

  if (/free|available|livre|availability/.test(intent.operation)) {
    const durationMinutes = numberValue(entities.durationMinutes ?? entities.duration, 30, 5, 1440);
    return readStep("calendar_find_free_time", { start: range.start, end: range.end, durationMinutes }, "Procurando horários livres…", tools, "synthesize");
  }

  if (intent.intent === "create") {
    const title = stringValue(entities.title);
    const explicitStart = stringValue(entities.start);
    const explicitEnd = stringValue(entities.end);
    const start = explicitStart && !Number.isNaN(Date.parse(explicitStart)) ? new Date(explicitStart).toISOString() : resolveDateTime(period, entities.time ?? entities.startTime);
    const duration = numberValue(entities.durationMinutes ?? entities.duration, 60, 5, 1440);
    const end = explicitEnd && !Number.isNaN(Date.parse(explicitEnd)) ? new Date(explicitEnd).toISOString() : start ? addMinutes(start, duration) : undefined;
    if (!title) return { direct: "Qual é o título do compromisso?" };
    if (!start || !end) return { direct: "Qual é a data e o horário do compromisso?" };
    const input = { title, start, end, location: stringValue(entities.location), description: stringValue(entities.description) };
    return writeStep("calendar_create", input, "Preparando o compromisso para sua confirmação…", tools, {
      domain: "calendar", actionType: "create", preview: `${title}\n${formatDate(start)} – ${formatDate(end)}`,
      affectedCount: 1, consequence: "Um novo compromisso será criado na sua agenda.", expiresInMs: 10 * 60_000
    });
  }

  if (intent.intent === "delete" || intent.intent === "update") {
    const previousIds = intent.referencesPreviousResult ? selectedPreviousEventIds(previous, intent.reference) : [];
    if (previousIds.length === 1) {
      if (intent.intent === "delete") return calendarDelete(previousIds[0], previous?.events?.find(event => event.id === previousIds[0]), tools);
      const patch = calendarPatch(entities, period);
      if (!Object.keys(patch).length) return { direct: "O que você quer alterar nesse compromisso?" };
      return calendarUpdate(previousIds[0], patch, previous?.events?.find(event => event.id === previousIds[0]), tools);
    }
    const search = readStepOnly("calendar_search", { start: range.start, end: range.end, query }, "Localizando o compromisso exato…", tools);
    if (!search) return unavailable("calendar_search");
    return {
      steps: [search],
      deferredAction: intent.intent === "delete" ? { kind: "calendar.delete", query } : { kind: "calendar.update", query, patch: calendarPatch(entities, period) },
      responseMode: "deterministic"
    };
  }

  return { direct: "Não consegui mapear essa solicitação para uma operação segura de agenda." };
}

function emailMutation(intent: AgentIntent): "trash" | "archive" | "mark_read" | "mark_unread" | undefined {
  const operation = intent.operation.toLowerCase();
  if (intent.intent === "delete" || /trash|delete|lixeira|apagar|remov/.test(operation)) return "trash";
  if (/archive|arquiv/.test(operation)) return "archive";
  if (/unread|nao_lido|não_lido/.test(operation)) return "mark_unread";
  if (/read|lido/.test(operation)) return "mark_read";
  return undefined;
}

function bulkEmailWrite(action: "trash" | "archive" | "mark_read" | "mark_unread", ids: string[], sender: string | undefined, tools: AgentToolDescriptor[]): BuiltIntentPlan {
  const tool = `email_bulk_${action === "trash" ? "trash" : action === "archive" ? "archive" : action}`;
  const verbs = { trash: "mover para a lixeira", archive: "arquivar", mark_read: "marcar como lidos", mark_unread: "marcar como não lidos" } as const;
  const target = sender ? `${ids.length} e-mail(s) de ${sender}` : `${ids.length} e-mail(s)`;
  return writeStep(tool, { messageIds: ids }, `Preparando ${target}…`, tools, {
    domain: "email", actionType: action, affectedCount: ids.length,
    preview: `${target}.`, consequence: `${target} serão ${verbs[action]}.`, expiresInMs: action === "trash" ? 5 * 60_000 : 10 * 60_000
  });
}

function calendarDelete(id: string, event: any, tools: AgentToolDescriptor[]): BuiltIntentPlan {
  return writeStep("calendar_delete", { eventId: id }, "Preparando o cancelamento para sua confirmação…", tools, {
    domain: "calendar", actionType: "delete", affectedCount: 1,
    preview: event ? `${event.title ?? "Compromisso"}\n${event.start ? formatDate(event.start) : ""}` : `Compromisso ${id}`,
    consequence: "O compromisso será cancelado.", expiresInMs: 5 * 60_000
  });
}
function calendarUpdate(id: string, patch: Record<string, unknown>, event: any, tools: AgentToolDescriptor[]): BuiltIntentPlan {
  return writeStep("calendar_update", { eventId: id, ...patch }, "Preparando a alteração para sua confirmação…", tools, {
    domain: "calendar", actionType: "update", affectedCount: 1,
    preview: `${event?.title ?? "Compromisso"}\nAlterações: ${JSON.stringify(patch)}`,
    consequence: "O compromisso será alterado.", expiresInMs: 10 * 60_000
  });
}
function calendarPatch(entities: Record<string, unknown>, period: unknown) {
  const patch: Record<string, unknown> = {};
  const title = stringValue(entities.newTitle ?? entities.title); if (title) patch.title = title;
  const time = entities.newTime ?? entities.time ?? entities.startTime;
  const start = time ? resolveDateTime(entities.newDate ?? entities.date ?? period, time) : undefined;
  if (start) { patch.start = start; patch.end = addMinutes(start, numberValue(entities.durationMinutes ?? entities.duration, 60, 5, 1440)); }
  const location = stringValue(entities.location); if (location) patch.location = location;
  const description = stringValue(entities.description); if (description) patch.description = description;
  return patch;
}

function filterPreviousEmailIds(ids: string[], previous: ConversationActionContextState | undefined, sender?: string) {
  if (!sender) return ids;
  const normalized = sender.toLowerCase();
  const allowed = new Set((previous?.emails ?? []).filter(item => item.from?.toLowerCase().includes(normalized)).map(item => item.id));
  return ids.filter(id => allowed.has(id));
}
function readStep(tool: string, input: Record<string, unknown>, explanation: string, tools: AgentToolDescriptor[], responseMode: "synthesize" | "deterministic" = "deterministic"): BuiltIntentPlan {
  const step = readStepOnly(tool, input, explanation, tools); return step ? { steps: [step], responseMode } : unavailable(tool);
}
function readStepOnly(tool: string, input: Record<string, unknown>, explanation: string, tools: AgentToolDescriptor[]): BuiltPlanStep | undefined {
  return hasTool(tools, tool) ? { tool, input: cleanUndefined(input), explanation } : undefined;
}
function writeStep(tool: string, input: Record<string, unknown>, explanation: string, tools: AgentToolDescriptor[], approval: ApprovalPlanMetadata): BuiltIntentPlan {
  return hasTool(tools, tool) ? { steps: [{ tool, input: cleanUndefined(input), explanation, approval }], responseMode: "deterministic" } : unavailable(tool);
}
function unavailable(tool: string): BuiltIntentPlan { return { direct: `A ferramenta necessária (${tool}) não está disponível com as conexões e permissões atuais.` }; }
function hasTool(tools: AgentToolDescriptor[], name: string) { return tools.some(tool => tool.name === name); }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function stringArray(value: unknown): string[] { if (Array.isArray(value)) return value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean); const single = stringValue(value); return single ? [single] : []; }
function boolValue(value: unknown) { return typeof value === "boolean" ? value : undefined; }
function numberValue(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback; }
function cleanUndefined(input: Record<string, unknown>) { return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)); }
function formatDate(value: string) { return new Date(value).toLocaleString("pt-BR"); }
