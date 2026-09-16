import { describe, expect, it } from "vitest";
import { ToolArgumentResolver } from "../../packages/core/src/agent/execution/tool-argument-resolver.js";
import type { AgentTaskState } from "../../packages/core/src/agent/goal/goal-types.js";

function task(resolvedPath: string, status: "resolved" | "needs_confirmation" = "resolved"): AgentTaskState {
  return {
    goal: {
      objective: "Crie teste.txt em Downloads",
      status: "active",
      constraints: [],
      resources: [],
      deliverables: [{ id: "deliverable-1", description: "teste.txt", requestedPath: "Downloads\\teste.txt", resolvedPath: status === "resolved" ? resolvedPath : undefined, pathResolutionStatus: status, required: true, status: "pending" }],
      steps: [],
    },
    selectedToolNames: [],
    artifacts: [],
  };
}

describe("ToolArgumentResolver", () => {
  it("replaces a model-provided path with the path authorized by GoalState", () => {
    const resolver = new ToolArgumentResolver();
    const resolved = resolver.resolve("create_text_file", { path: "C:\\Temp\\teste.txt", content: "ok" }, task("C:\\Users\\Rafael\\Downloads\\teste.txt"));

    expect(resolved).toEqual({ path: "C:\\Users\\Rafael\\Downloads\\teste.txt", content: "ok" });
  });

  it("does not bind a destination that still needs confirmation", () => {
    const resolver = new ToolArgumentResolver();
    const input = { path: "C:\\Temp\\teste.txt", content: "ok" };

    expect(resolver.resolve("create_text_file", input, task("", "needs_confirmation"))).toEqual(input);
  });
});
