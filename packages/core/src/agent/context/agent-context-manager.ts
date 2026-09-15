import { AGENT_SYSTEM_PROMPT_V2 } from "../../security/agent-system-prompt-v2.js";
import type { AgentModelMessage, AgentObservation } from "../loop/types.js";

export class AgentContextManager {
  constructor(private readonly maxBytes = 96_000, private readonly maxObservations = 20) {}
  build(userRequest: string, conversation: AgentModelMessage[] = [], observations: AgentObservation[] = []): AgentModelMessage[] {
    const system: AgentModelMessage = { role: "system", content: AGENT_SYSTEM_PROMPT_V2, trust: "TRUSTED_LOCAL" };
    const safeConversation = conversation.filter(message => message.role !== "system" && !looksLikeReasoning(message.content));
    const recentObservations = observations.slice(-this.maxObservations).map(observation => ({ role: "tool" as const, toolCallId: observation.toolCallId, trust: observation.trust, content: JSON.stringify({ source: observation.toolName, trust: observation.trust, summary: observation.summary, references: observation.references, data: observation.data }) }));
    const messages = [system, ...safeConversation, ...recentObservations, { role: "user" as const, content: userRequest, trust: "TRUSTED_LOCAL" as const }];
    while (Buffer.byteLength(JSON.stringify(messages)) > this.maxBytes && messages.length > 2) messages.splice(1, 1);
    return messages;
  }
}
function looksLikeReasoning(content: string) { return /(?:chain[- ]of[- ]thought|internal reasoning|raciocínio interno)\s*:/i.test(content); }
