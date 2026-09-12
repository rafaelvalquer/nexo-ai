import type { PersistedChatMessage } from "../../chat/history.js";
import type { LLMMessage } from "../../llm/provider.js";
import { AGENT_LIMITS } from "../runtime/limits.js";

/** Bounded, role-safe context for a new chat turn. It intentionally excludes the current user turn. */
export class ConversationContextBuilder {
  build(history: PersistedChatMessage[], maxMessages = 12, maxCharacters = AGENT_LIMITS.maxContextCharacters): LLMMessage[] {
    const selected = history.slice(-maxMessages); const messages: LLMMessage[] = []; let used = 0;
    for (const item of [...selected].reverse()) {
      if (item.role === "system") continue;
      const content = item.content.slice(0, Math.max(0, maxCharacters - used)); if (!content) break;
      messages.unshift({ role: item.role, content }); used += content.length;
    }
    return messages;
  }
}
