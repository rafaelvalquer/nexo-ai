import type { ConversationActionContextState } from "../context/conversation-action-context.js";
import type { AgentIntent } from "./intent-schema.js";

const base = (overrides: Partial<AgentIntent>): AgentIntent => ({
  schemaVersion: 1,
  status: "ready",
  domain: "general",
  intent: "answer",
  operation: "answer",
  entities: {},
  referencesPreviousResult: false,
  requiresDataLookup: false,
  requiresConfirmation: false,
  confidence: .8,
  ...overrides
});

export function resolveFallbackIntent(text: string, previous?: ConversationActionContextState): AgentIntent | undefined {
  const value = text.trim();
  const lower = value.toLowerCase();

  const email = /\b(e-?mails?|gmail|caixa\s+de\s+entrada)\b/i.test(value);
  if (email) return emailFallback(value, lower, previous);

  const calendar = /\b(agenda|calend[aá]rio|compromissos?|reuni[aã]o|eventos?)\b/i.test(value);
  if (calendar) return calendarFallback(value, lower, previous);

  const filesystem = /\b(arquivos?|pastas?|downloads?|baixados|documentos?|documents?|desktop|[aá]rea\s+de\s+trabalho)\b|\.[a-z0-9]{2,8}\b/i.test(value);
  if (filesystem) return filesystemFallback(value, lower, previous);

  if (/\b(apague|delete|deletei|remova|exclua|jogue\s+fora)\b/i.test(value) && !previous?.lastDomain) {
    return base({
      status: "needs_clarification",
      operation: "ambiguous_delete",
      confidence: .4,
      missing: ["target"],
      question: "O que exatamente você quer excluir?"
    });
  }
  return undefined;
}

function emailFallback(text: string, lower: string, previous?: ConversationActionContextState): AgentIntent {
  const sender = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const referencesPreviousResult = Boolean(previous?.lastDomain === "email" && /\b(eles|elas|esses|essas|os\s+primeiros|os\s+anteriores|aqueles)\b/i.test(text));

  if (/\b(apague|delete|deleta|delete|remova|exclua|jogue\s+(?:eles\s+)?(?:na\s+)?lixeira)\b/i.test(text)) {
    return base({ domain: "email", intent: "delete", operation: "bulk_trash", entities: sender ? { sender } : {}, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: sender || referencesPreviousResult ? .97 : .76 });
  }
  if (/\b(arquive|arquivar|archive)\b/i.test(text)) {
    return base({ domain: "email", intent: "move", operation: "archive", entities: sender ? { sender } : {}, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: .94 });
  }
  if (/\b(marque|marcar).*(n[aã]o\s+lido|unread)\b/i.test(text)) {
    return base({ domain: "email", intent: "update", operation: "mark_unread", entities: sender ? { sender } : {}, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: .95 });
  }
  if (/\b(marque|marcar).*(lido|read)\b/i.test(text)) {
    return base({ domain: "email", intent: "update", operation: "mark_read", entities: sender ? { sender } : {}, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: .95 });
  }
  if (/\b(resum|resumo|resuma)\b/i.test(text)) {
    return base({ domain: "email", intent: "summarize", operation: referencesPreviousResult ? "summarize_previous" : "summarize_messages", entities: { unread: /n[aã]o\s+lidos?|unread/i.test(text), maxResults: 20 }, referencesPreviousResult, requiresDataLookup: true, confidence: .98 });
  }
  if (/\b(quantos?|quantidade|total)\b/i.test(text)) {
    return base({ domain: "email", intent: "stats", operation: "email_stats", entities: {}, requiresDataLookup: true, confidence: .99 });
  }
  if (/\b([uú]ltim|recent|mais\s+novos?|mais\s+recentes?)\b/i.test(lower)) {
    const one = /\b([uú]ltimo|mais\s+recente)\s+e-?mail\b/i.test(text);
    return base({ domain: "email", intent: one ? "read" : "list", operation: one ? "latest" : "recent_messages", entities: { maxResults: one ? 1 : 20 }, requiresDataLookup: true, confidence: .99 });
  }
  if (/\b(n[aã]o\s+lidos?|unread)\b/i.test(text)) {
    return base({ domain: "email", intent: "search", operation: "search_messages", entities: { unread: true, maxResults: 20 }, requiresDataLookup: true, confidence: .98 });
  }
  return base({ domain: "email", intent: "list", operation: "recent_messages", entities: { maxResults: 20 }, requiresDataLookup: true, confidence: .88 });
}

function calendarFallback(text: string, lower: string, previous?: ConversationActionContextState): AgentIntent {
  const period = /amanh[aã]/i.test(text) ? "tomorrow" : /hoje/i.test(text) ? "today" : /esta\s+semana/i.test(text) ? "this_week" : undefined;
  const referencesPreviousResult = Boolean(previous?.lastDomain === "calendar" && /\b(esse|essa|ele|ela|compromisso\s+anterior|reuni[aã]o\s+anterior)\b/i.test(text));
  if (/\b(cancele|delete|deleta|apague|remova|exclua)\b/i.test(text)) {
    return base({ domain: "calendar", intent: "delete", operation: "delete_event", entities: { period: period ?? "today" }, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: .9 });
  }
  if (/\b(crie|criar|marque|agende|agendar)\b/i.test(text)) {
    return base({ domain: "calendar", intent: "create", operation: "create_event", entities: { period: period ?? "today" }, requiresDataLookup: false, requiresConfirmation: true, confidence: .75 });
  }
  if (/\b(mude|altere|remarque|edite)\b/i.test(text)) {
    return base({ domain: "calendar", intent: "update", operation: "update_event", entities: { period: period ?? "today" }, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: .75 });
  }
  if (/\b(livre|livres|dispon[ií]vel|hor[aá]rio)\b/i.test(lower)) {
    return base({ domain: "calendar", intent: "search", operation: "find_free_time", entities: { period: period ?? "today" }, requiresDataLookup: true, confidence: .94 });
  }
  return base({ domain: "calendar", intent: "list", operation: "list_events", entities: { period: period ?? "today" }, requiresDataLookup: true, confidence: .99 });
}

function filesystemFallback(text: string, lower: string, previous?: ConversationActionContextState): AgentIntent {
  const file = text.match(/([^\\/:*?"<>|\s]+\.[A-Za-z0-9]{1,8})/i)?.[1];
  const folder = /\b(downloads?|baixados)\b/i.test(text) ? "downloads" : /\b(documentos?|documents?)\b/i.test(text) ? "documents" : /\b(desktop|[aá]rea\s+de\s+trabalho)\b/i.test(text) ? "desktop" : undefined;
  const referencesPreviousResult = Boolean(previous?.lastDomain === "filesystem" && /\b(ele|ela|esse|essa|eles|esses|arquivo\s+anterior)\b/i.test(text));

  if (/\b(apague|delete|deleta|remova|exclua|jogue\s+fora)\b/i.test(text)) {
    if (!file && !referencesPreviousResult) return base({ status: "needs_clarification", domain: "filesystem", intent: "delete", operation: "trash_file", entities: { folder }, confidence: .5, missing: ["file"], question: "Qual arquivo você quer mover para a lixeira?" });
    return base({ domain: "filesystem", intent: "delete", operation: "trash_file", entities: { folder, file }, referencesPreviousResult, requiresDataLookup: true, requiresConfirmation: true, confidence: file ? .98 : .8 });
  }
  if (/\b(liste|listar|mostre|mostrar|veja|ver)\b/i.test(text)) {
    return base({ domain: "filesystem", intent: "list", operation: "list_files", entities: { folder }, requiresDataLookup: true, confidence: .95 });
  }
  if (/\b(leia|abrir\s+arquivo|conte[uú]do)\b/i.test(lower) && file) {
    return base({ domain: "filesystem", intent: "read", operation: "read_file", entities: { folder, file }, requiresDataLookup: true, confidence: .95 });
  }
  if (/\b(procure|pesquise|encontre)\b/i.test(text)) {
    return base({ domain: "filesystem", intent: "search", operation: "search_files", entities: { folder, query: file ?? text }, requiresDataLookup: true, confidence: .85 });
  }
  return base({ domain: "filesystem", intent: "list", operation: "list_files", entities: { folder }, requiresDataLookup: true, confidence: .72 });
}
