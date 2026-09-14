import type { ConnectionProvider } from "@nexo/shared";

export type EmailMailboxCategory =
  | "primary"
  | "promotions"
  | "social"
  | "updates"
  | "forums";

export type EmailMailboxPreferenceCategory = EmailMailboxCategory | "inbox";

export type EmailSearchPreference = {
  connectionId: string;
  categories: EmailMailboxPreferenceCategory[];
  createdAt: string;
  updatedAt: string;
};

export type MailboxOption = {
  id: EmailMailboxPreferenceCategory;
  label: string;
  value: EmailMailboxPreferenceCategory;
};

export type MailboxPreferenceContext = {
  connectionId: string;
  provider: ConnectionProvider;
  categories: EmailMailboxPreferenceCategory[];
};
