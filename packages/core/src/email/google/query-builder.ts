import type { EmailMailboxCategory } from "../preferences/types.js";
import { GOOGLE_MAILBOX_CATEGORIES } from "../preferences/category-resolver.js";
import { GMAIL_CATEGORY_TERMS } from "./category-mapper.js";

export type GmailSearchQueryInput = {
  categories?: EmailMailboxCategory[];
  unread?: boolean;
  sender?: string;
  query?: string;
  period?: { after?: string; before?: string };
};

export function buildGmailSearchQuery(input: GmailSearchQueryInput): string {
  const parts = ["in:inbox"];
  if (input.unread) parts.push("is:unread");
  if (input.sender?.trim()) parts.push(`from:${quoteIfNeeded(input.sender.trim())}`);
  if (input.period?.after) parts.push(`after:${input.period.after}`);
  if (input.period?.before) parts.push(`before:${input.period.before}`);

  const categories = normalizeCategories(input.categories);
  if (categories.length && categories.length < GOOGLE_MAILBOX_CATEGORIES.length) {
    const terms = categories.map(category => GMAIL_CATEGORY_TERMS[category]);
    parts.push(terms.length === 1 ? terms[0] : `{${terms.join(" ")}}`);
  }

  if (input.query?.trim()) parts.push(input.query.trim());
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeCategories(categories?: EmailMailboxCategory[]) {
  const allowed = new Set<EmailMailboxCategory>(GOOGLE_MAILBOX_CATEGORIES);
  return [...new Set((categories ?? []).filter(category => allowed.has(category)))];
}

function quoteIfNeeded(value: string) {
  return /\s/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}
