import type { EmailMailboxCategory } from "../preferences/types.js";

export const GMAIL_CATEGORY_LABELS: Record<EmailMailboxCategory, string> = {
  primary: "CATEGORY_PERSONAL",
  promotions: "CATEGORY_PROMOTIONS",
  social: "CATEGORY_SOCIAL",
  updates: "CATEGORY_UPDATES",
  forums: "CATEGORY_FORUMS",
};

export const GMAIL_CATEGORY_TERMS: Record<EmailMailboxCategory, string> = {
  primary: "category:primary",
  promotions: "category:promotions",
  social: "category:social",
  updates: "category:updates",
  forums: "category:forums",
};
