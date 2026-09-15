import type { AgentIntent } from "./intent-schema.js";
import type { EmailMailboxCategory } from "../../email/preferences/types.js";
import { extractEmailAddresses,extractSimpleEmailBody } from "../../email/compose/extractor.js";
import { canonicalizeEmailComposeEntities,hasRecipients,normalizeBody } from "../../email/compose/normalizer.js";

const CATEGORY_PATTERNS: Array<[EmailMailboxCategory, RegExp]> = [
  ["primary", /\b(principal|primary)\b/i],
  ["promotions", /\b(promo[cç][oõ]es|promotions?)\b/i],
  ["social", /\b(social)\b/i],
  ["updates", /\b(atualiza[cç][oõ]es|updates?)\b/i],
  ["forums", /\b(f[oó]runs?|forums?)\b/i],
];

export function isMailboxPreferenceCommand(text: string) {
  return /\b(selecionar|selecione|alterar|altere|mudar|mude|configurar|configure|escolher|escolha)\b/i.test(text)
    && /\b(caixas?|abas?).*(e-?mails?|gmail)|\b(e-?mails?|gmail).*(caixas?|abas?)\b/i.test(text);
}

export function extractExplicitEmailCategories(text: string): EmailMailboxCategory[] {
  return CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}

export function deterministicEmailPreferenceIntent(text: string): AgentIntent | undefined {
  if (!isMailboxPreferenceCommand(text)) return undefined;
  return baseIntent({
    intent: "update",
    operation: "select_mailboxes",
    entities: {},
    requiresDataLookup: false,
    confidence: 1,
  });
}

export function deterministicEmailCategoryIntent(text: string): AgentIntent | undefined {
  const categories = extractExplicitEmailCategories(text);
  if (!categories.length || isMailboxPreferenceCommand(text)) return undefined;
  const emailContext = /\b(e-?mails?|gmail|mensagens?|caixa\s+de\s+entrada)\b/i.test(text)
    || /\b(mostre|mostrar|liste|listar|ver|veja|procure|pesquise|resuma|resumir|quantos?|n[aã]o\s+lidos?)\b/i.test(text);
  if (!emailContext) return undefined;
  const unread = /\b(n[aã]o\s+lidos?|unread)\b/i.test(text);
  const stats = /\b(quantos?|quantidade|total)\b/i.test(text);
  const summarize = /\b(resum|resumo|resuma)\b/i.test(text);
  return baseIntent({
    intent: stats ? "stats" : summarize ? "summarize" : unread ? "search" : "list",
    operation: stats ? "email_stats" : summarize ? "summarize_messages" : "search_messages",
    entities: { categories, ...(unread ? { unread: true } : {}), maxResults: 20 },
    requiresDataLookup: true,
    confidence: .99,
  });
}

export function deterministicEmailReadIntent(text:string):AgentIntent|undefined{
  if(!/\b(e-?mails?|mensagens?|caixa\s+de\s+entrada)\b/i.test(text))return undefined;
  const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const latest=/(?:ultimo|ultima)\s+e-?mail\b|\be-?mail\s+mais\s+recente\b/i.test(normalized);
  const summarize=/\b(resuma|resumir|resumo)\b/i.test(text);
  const list=latest||summarize||/\b(mostre|mostrar|liste|listar|[uú]ltimos?)\b/i.test(text);
  if(!list)return undefined;
  const quantity=latest?1:requestedQuantity(text)??20;
  return baseIntent({intent:latest?"read":summarize?"summarize":"list",operation:latest?"latest":"search_messages",entities:{maxResults:quantity},confidence:1});
}

export function enrichEmailIntent(intent: AgentIntent, text: string): AgentIntent {
  if (intent.domain !== "email") return intent;
  if (isMailboxPreferenceCommand(text)) {
    return { ...intent, status: "ready", intent: "update", operation: "select_mailboxes", entities: {}, requiresDataLookup: false, requiresConfirmation: false, missing: undefined, question: undefined };
  }
  let entities={...intent.entities} as Record<string,unknown>;
  const quantity=requestedQuantity(text);if(quantity)entities.maxResults=quantity;
  if(intent.intent==="send"||/send|compose/.test(intent.operation)){
    entities=canonicalizeEmailComposeEntities(entities);
    if(!hasRecipients(entities)){
      const emails=extractEmailAddresses(text);if(emails.length)entities.to=emails;
    }
    if(!normalizeBody(entities)){
      const body=extractSimpleEmailBody(text);if(body)entities.body=body;
    }
  }
  const categories = extractExplicitEmailCategories(text);
  if (categories.length) entities={...entities,categories};
  return { ...intent, entities };
}

function requestedQuantity(text:string){const match=text.match(/\b(?:meus|minhas|os|as)?\s*(\d{1,2})\s+(?:[uú]ltimos?\s+)?(?:e-?mails?|mensagens?)\b/i);return match?Math.max(1,Math.min(50,Number(match[1]))):undefined;}

function baseIntent(overrides: Partial<AgentIntent>): AgentIntent {
  return {
    schemaVersion: 1,
    status: "ready",
    domain: "email",
    intent: "list",
    operation: "recent_messages",
    entities: {},
    referencesPreviousResult: false,
    requiresDataLookup: true,
    requiresConfirmation: false,
    confidence: .95,
    ...overrides,
  };
}
