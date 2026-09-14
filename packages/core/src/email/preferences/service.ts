import type { EmailMailboxPreferenceCategory, EmailSearchPreference } from "./types.js";
import { EmailSearchPreferenceRepository } from "./repository.js";

const VALID = new Set<EmailMailboxPreferenceCategory>(["primary", "promotions", "social", "updates", "forums", "inbox"]);

export class EmailSearchPreferenceService {
  constructor(private readonly repository: EmailSearchPreferenceRepository) {}

  get(connectionId: string): EmailSearchPreference | undefined {
    return this.repository.get(connectionId);
  }

  save(connectionId: string, categories: EmailMailboxPreferenceCategory[]): EmailSearchPreference {
    const normalized = [...new Set(categories.filter(category => VALID.has(category)))];
    if (!normalized.length) throw new Error("Selecione pelo menos uma caixa.");
    return this.repository.save(connectionId, normalized);
  }

  delete(connectionId: string): void {
    this.repository.delete(connectionId);
  }

  resolveCategories(connectionId: string, explicit?: EmailMailboxPreferenceCategory[]): EmailMailboxPreferenceCategory[] | undefined {
    if (explicit?.length) return [...new Set(explicit.filter(category => VALID.has(category)))];
    return this.get(connectionId)?.categories;
  }

  transaction<T>(work: () => T): T {
    return this.repository.transaction(work);
  }
}
