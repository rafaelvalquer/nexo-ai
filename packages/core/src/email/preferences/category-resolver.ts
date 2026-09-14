import type { ConnectionProvider } from "@nexo/shared";
import type { EmailMailboxPreferenceCategory, MailboxOption } from "./types.js";

export const GOOGLE_MAILBOX_CATEGORIES = ["primary", "promotions", "social", "updates", "forums"] as const;

const GOOGLE_OPTIONS: MailboxOption[] = [
  { id: "primary", label: "Principal", value: "primary" },
  { id: "promotions", label: "Promoções", value: "promotions" },
  { id: "social", label: "Social", value: "social" },
  { id: "updates", label: "Atualizações", value: "updates" },
  { id: "forums", label: "Fóruns", value: "forums" },
];

const MICROSOFT_OPTIONS: MailboxOption[] = [
  { id: "inbox", label: "Caixa de entrada", value: "inbox" },
];

export function getMailboxOptions(provider: ConnectionProvider): MailboxOption[] {
  return (provider === "google" ? GOOGLE_OPTIONS : MICROSOFT_OPTIONS).map(option => ({ ...option }));
}

export function defaultMailboxCategories(provider: ConnectionProvider): EmailMailboxPreferenceCategory[] {
  return provider === "google" ? ["primary"] : ["inbox"];
}

export function normalizeMailboxCategories(provider: ConnectionProvider, categories: unknown): EmailMailboxPreferenceCategory[] {
  const allowed = new Set(getMailboxOptions(provider).map(option => option.id));
  if (!Array.isArray(categories)) return [];
  return [...new Set(categories.filter((value): value is EmailMailboxPreferenceCategory => typeof value === "string" && allowed.has(value as EmailMailboxPreferenceCategory)))];
}

export function mailboxCategoryLabel(category: EmailMailboxPreferenceCategory): string {
  return [...GOOGLE_OPTIONS, ...MICROSOFT_OPTIONS].find(option => option.id === category)?.label ?? category;
}

export function mailboxCategoryListLabel(categories: EmailMailboxPreferenceCategory[]): string {
  const labels = categories.map(mailboxCategoryLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}
