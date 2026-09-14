import type { NexoDatabase } from "../../database/db.js";
import type { EmailMailboxPreferenceCategory, EmailSearchPreference } from "./types.js";

const VALID = new Set<EmailMailboxPreferenceCategory>(["primary", "promotions", "social", "updates", "forums", "inbox"]);

type PreferenceRow = {
  connection_id: string;
  categories_json: string;
  created_at: string;
  updated_at: string;
};

export class EmailSearchPreferenceRepository {
  constructor(private readonly db: NexoDatabase) {}

  get(connectionId: string): EmailSearchPreference | undefined {
    const row = this.db.get<PreferenceRow>("SELECT * FROM email_search_preferences WHERE connection_id=?", [connectionId]);
    if (!row) return undefined;
    let categories: EmailMailboxPreferenceCategory[] = [];
    try {
      const parsed = JSON.parse(row.categories_json);
      if (Array.isArray(parsed)) categories = parsed.filter((value): value is EmailMailboxPreferenceCategory => typeof value === "string" && VALID.has(value as EmailMailboxPreferenceCategory));
    } catch {}
    if (!categories.length) return undefined;
    return { connectionId: row.connection_id, categories, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  save(connectionId: string, categories: EmailMailboxPreferenceCategory[]): EmailSearchPreference {
    const existing = this.get(connectionId);
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt ?? now;
    this.db.run(
      "INSERT OR REPLACE INTO email_search_preferences(connection_id,categories_json,created_at,updated_at) VALUES(?,?,?,?)",
      [connectionId, JSON.stringify(categories), createdAt, now],
    );
    return { connectionId, categories: [...categories], createdAt, updatedAt: now };
  }

  delete(connectionId: string) {
    this.db.run("DELETE FROM email_search_preferences WHERE connection_id=?", [connectionId]);
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work);
  }
}
