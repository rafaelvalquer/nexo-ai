import { describe, expect, it } from "vitest";
import {
  BROWSER_AGENT_MODEL_ENV,
  resolveBrowserAgentModel
} from "../../packages/browser-agent/src/model-selection";

describe("Browser Agent model selection", () => {
  it("keeps the global Nexo model when no browser override exists", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", undefined, {})).toBe("qwen3:4b");
  });

  it("uses a dedicated Browser Agent model from the environment", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", undefined, {
      [BROWSER_AGENT_MODEL_ENV]:" qwen3:4b-instruct "
    })).toBe("qwen3:4b-instruct");
  });

  it("lets an explicit browser-model override win over the environment", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", "qwen3:8b", {
      [BROWSER_AGENT_MODEL_ENV]:"qwen3:4b-instruct"
    })).toBe("qwen3:8b");
  });
});
