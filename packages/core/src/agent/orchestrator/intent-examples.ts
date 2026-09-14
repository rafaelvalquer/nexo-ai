import type { AgentIntent, IntentDomain } from "./intent-schema.js";

export type IntentExample = { utterance: string; intent: AgentIntent };

const intent = (domain: IntentDomain, name: AgentIntent["intent"], operation: string, entities: Record<string, unknown> = {}, mutation = false): AgentIntent => ({
  schemaVersion: 1,
  status: "ready",
  domain,
  intent: name,
  operation,
  entities,
  referencesPreviousResult: false,
  requiresDataLookup: !["send", "create"].includes(name),
  requiresConfirmation: mutation,
  confidence: .99
});

const EXAMPLES: IntentExample[] = [
  { utterance: "selecionar caixas de e-mails", intent: { ...intent("email", "update", "select_mailboxes"), requiresDataLookup: false } },
  { utterance: "mostre meus emails de Promoções", intent: intent("email", "list", "search_messages", { categories: ["promotions"], maxResults: 20 }) },
  { utterance: "quais são meus últimos emails?", intent: intent("email", "list", "recent_messages", { maxResults: 20 }) },
  { utterance: "ve meus email recente", intent: intent("email", "list", "recent_messages", { maxResults: 20 }) },
  { utterance: "faça um resumo dos emails não lidos", intent: intent("email", "summarize", "summarize_messages", { unread: true, maxResults: 20 }) },
  { utterance: "quantos emails não lidos eu tenho?", intent: intent("email", "stats", "email_stats", { unread: true }) },
  { utterance: "delete os emails do notifications@github.com", intent: intent("email", "delete", "bulk_trash", { sender: "notifications@github.com" }, true) },
  { utterance: "joga os emails do github na lixeira", intent: intent("email", "delete", "bulk_trash", { query: "github" }, true) },
  { utterance: "arquive esses emails", intent: { ...intent("email", "move", "archive", {}, true), referencesPreviousResult: true, reference: { source: "previous_result", selection: { type: "all" } } } },
  { utterance: "mande email para rafael@example.com falando teste", intent: { ...intent("email", "send", "compose_and_send", { to: ["rafael@example.com"], subject: "Teste", body: "Teste" }, true), requiresDataLookup: false } },
  { utterance: "qual minha agenda amanhã?", intent: intent("calendar", "list", "list_events", { period: "tomorrow" }) },
  { utterance: "agenda amanha", intent: intent("calendar", "list", "list_events", { period: "tomorrow" }) },
  { utterance: "o que eu tenho hoje?", intent: intent("calendar", "list", "list_events", { period: "today" }) },
  { utterance: "tenho horário livre amanhã?", intent: intent("calendar", "search", "find_free_time", { period: "tomorrow", durationMinutes: 30 }) },
  { utterance: "crie uma reunião amanhã às 10", intent: { ...intent("calendar", "create", "create_event", { period: "tomorrow", time: "10:00", title: "Reunião" }, true), requiresDataLookup: false } },
  { utterance: "cancele esse compromisso", intent: { ...intent("calendar", "delete", "delete_event", {}, true), referencesPreviousResult: true, reference: { source: "previous_result", selection: { type: "all" } } } },
  { utterance: "liste os arquivos da pasta download", intent: intent("filesystem", "list", "list_files", { folder: "downloads" }) },
  { utterance: "apaga o csv do download", intent: intent("filesystem", "delete", "trash_file", { folder: "downloads", file: "arquivo.csv" }, true) },
  { utterance: "delete o arquivo relatorioSolar20260911.csv da pasta download", intent: intent("filesystem", "delete", "trash_file", { folder: "downloads", file: "relatorioSolar20260911.csv" }, true) },
  { utterance: "leia relatorio.txt em documentos", intent: intent("filesystem", "read", "read_file", { folder: "documents", file: "relatorio.txt" }) },
  { utterance: "procure notas.pdf no desktop", intent: intent("filesystem", "search", "search_files", { folder: "desktop", query: "notas.pdf" }) },
  { utterance: "abra o github no navegador", intent: intent("browser", "read", "open_url", { url: "https://github.com" }) }
];

export function examplesForDomain(domain: IntentDomain, limit = 5) {
  return EXAMPLES.filter(example => example.intent.domain === domain).slice(0, limit);
}
