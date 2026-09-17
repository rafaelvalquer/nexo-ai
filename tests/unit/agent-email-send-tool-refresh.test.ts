import { describe, expect, it, vi } from "vitest";
import { AgentLoopRunner } from "../../packages/core/src/agent/loop/agent-loop-runner.js";

describe("Agent V2 email.send tool refresh", () => {
  it("repairs email.send before taking the tool catalog snapshot", async () => {
    let ready = false;
    const account = {
      id: "11111111-1111-4111-8111-111111111111",
      provider: "google",
      accountEmail: "rafael@example.com",
      capabilities: ["email.read", "email.modify"],
      requestedCapabilities: ["email.read", "email.modify", "email.send"]
    };

    const connections = {
      resolveForCapability: vi.fn(() => ready
        ? { status: "ready", account: { ...account, capabilities: [...account.capabilities, "email.send"] } }
        : { status: "missing_capability", account }),
      test: vi.fn(async () => { ready = true; }),
      get: vi.fn(() => ready ? { ...account, capabilities: [...account.capabilities, "email.send"] } : account)
    };

    const catalog = {
      list: vi.fn(() => ready ? [{
        name: "email_send_composed",
        description: "Envia um e-mail após confirmação explícita do usuário",
        domain: "email",
        operation: "send",
        risk: "CRITICAL",
        mutatesState: true,
        requiresConfirmation: true,
        permissions: ["email.send"],
        parameters: { type: "object", properties: {} }
      }] : [])
    };

    const registry = {
      get: vi.fn((name: string) => name === "email_send_composed" ? {
        name,
        risk: "CRITICAL",
        mutationSafety: { idempotency: "none", reconciliation: "supported" }
      } : undefined)
    };

    let modelTools: string[] = [];
    const llm = {
      agentTurn: vi.fn(async (request: any) => {
        modelTools = request.tools.map((tool: any) => tool.name);
        return { content: "Ferramenta disponível.", toolCalls: [] };
      })
    };

    const runner = new AgentLoopRunner(
      llm as any,
      catalog as any,
      registry as any,
      { allowedFilesystemRoots:()=>[] } as any,
      connections as any
    );

    const result = await runner.run(
      "Envie e-mail para rafael.valquer@gmail.com falando Oi",
      { mode: "full" }
    );

    expect(connections.test).toHaveBeenCalledTimes(1);
    expect(catalog.list).toHaveBeenCalledTimes(1);
    expect(modelTools).toContain("email_send_composed");
    expect(result.status).toBe("COMPLETED");
  });
});
