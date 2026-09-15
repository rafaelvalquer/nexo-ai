import { describe, expect, it } from "vitest";
import { AgentLoop } from "../../packages/core/src/agent/loop/agent-loop.js";
import { encodeObservation } from "../../packages/core/src/agent/loop/observation-encoder.js";
import { wrapPresentationData } from "../../packages/core/src/chat/presentation/internal-metadata.js";
import type { AgentTurnRequest } from "../../packages/core/src/agent/loop/types.js";
import type { PreparedAction } from "../../packages/core/src/agent/execution/types.js";

describe("AgentLoop presentation metadata isolation", () => {
  it("persists effective presentation input without sending connectionId back to the model", async () => {
    const requests: AgentTurnRequest[] = [];
    let turn = 0;
    const action: PreparedAction = {
      executionId: "exec-1",
      toolName: "email_latest",
      input: { connectionId: "conn-secret", maxResults: 10 },
      fingerprint: "fp-1",
      mutatesState: false,
      risk: "READ",
      requiresApproval: false,
      status: "PREPARED"
    };
    const loop = new AgentLoop({
      agentTurn: async request => {
        requests.push(structuredClone(request));
        return turn++ === 0
          ? { toolCalls: [{ id: "call-1", name: "email_latest", arguments: { maxResults: 10 } }] }
          : { content: "Concluído", toolCalls: [] };
      },
      tools: () => [{ name: "email_latest", description: "Últimos e-mails" }],
      preflight: async () => ({ ok: true, action }),
      execute: async prepared => ({ status: "SUCCEEDED", action: prepared, result: { ok: true, summary: "1 e-mail", data: { messages: [] } } }),
      observe: (result, id) => {
        const observation = encodeObservation(id, "email_latest", result.result!, "UNTRUSTED_CONTENT");
        observation.data = wrapPresentationData(observation.data, result.action.input);
        return observation;
      }
    });

    const state = await loop.run("quais são meus últimos e-mails?");
    expect(state.status).toBe("COMPLETED");
    expect(JSON.stringify(state.observations)).toContain("conn-secret");
    expect(JSON.stringify(requests)).not.toContain("conn-secret");
    expect(JSON.stringify(state.messages)).not.toContain("conn-secret");
  });
});
