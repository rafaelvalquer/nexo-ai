import type { AgentRuntime } from "../runtime/runtime.js";
import type { PendingClarification } from "./types.js";

export class ClarificationRepository {
  constructor(private readonly runtime: AgentRuntime) {}

  save(record: PendingClarification) {
    this.runtime.savePendingClarification(record);
    return record;
  }

  pendingForConversation(conversationId: string) {
    const pending = this.runtime.getPendingClarification(conversationId);
    if (!pending) return undefined;
    if (pending.expiresAt && Date.parse(pending.expiresAt) <= Date.now()) {
      const expired: PendingClarification = {
        ...pending,
        status: "expired",
        resolvedAt: new Date().toISOString(),
      };
      this.runtime.updateClarification(expired);
      return undefined;
    }
    return pending;
  }

  get(id: string) {
    return this.runtime.getClarification(id);
  }

  update(record: PendingClarification) {
    return this.runtime.updateClarification(record);
  }

  cancel(id: string) {
    const record = this.get(id);
    if (!record || record.status !== "pending") return record;
    return this.update({
      ...record,
      status: "cancelled",
      resolvedAt: new Date().toISOString(),
    });
  }
}
