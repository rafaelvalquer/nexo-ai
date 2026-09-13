import type { NexoDatabase } from "../database/db.js";

const MAIN_CONVERSATION = "assistant-main";

type ActiveDocumentState = {
  documentIds: string[];
  updatedAt: string;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export class DocumentConversationContext {
  constructor(private db: NexoDatabase, private conversationId = MAIN_CONVERSATION) {}

  setActive(documentIds: string[]) {
    const unique = [...new Set(documentIds)].filter(Boolean);
    if (!unique.length) return this.clear();
    const state: ActiveDocumentState = { documentIds: unique, updatedAt: new Date().toISOString() };
    this.db.run(
      "INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",
      [this.stateKey(), JSON.stringify(state)]
    );
    return unique;
  }

  clear() {
    this.db.run("DELETE FROM application_state WHERE key=?", [this.stateKey()]);
    return [] as string[];
  }

  resolveActiveDocuments() {
    const row = this.db.get<{ value: string }>("SELECT value FROM application_state WHERE key=?", [this.stateKey()]);
    if (!row?.value) return [];
    try {
      const parsed = JSON.parse(row.value) as ActiveDocumentState;
      if (!Array.isArray(parsed.documentIds)) return [];
      const ready = parsed.documentIds.filter(id => this.db.get("SELECT id FROM documents WHERE id=? AND status='ready'", [id]));
      if (ready.length !== parsed.documentIds.length) {
        if (ready.length) this.setActive(ready);
        else this.clear();
      }
      return ready;
    } catch {
      this.clear();
      return [];
    }
  }

  shouldContinueWithDocuments(userText: string) {
    const text = normalize(userText);
    return (
      /^(e|mas|entao|agora)\b/.test(text) ||
      /\b(documento|arquivo|contrato|anexo|pdf|clausula|trecho|pagina|multa|prazo|cancelamento|renovacao|pagamento|valor|obrigacao|risco)\b/.test(text) ||
      /\b(resuma|resumo|sintetize|compare|diferenca|extraia)\b/.test(text) ||
      /\b(nele|nela|neste|nesta|nesse|nessa|isso|esse|essa)\b/.test(text)
    );
  }

  resolve(currentDocumentIds: string[], userText: string) {
    if (currentDocumentIds.length) return this.setActive(currentDocumentIds);
    const active = this.resolveActiveDocuments();
    if (!active.length) return [];
    if (this.shouldContinueWithDocuments(userText)) return active;
    this.clear();
    return [];
  }

  private stateKey() {
    return `document_context:${this.conversationId}`;
  }
}
