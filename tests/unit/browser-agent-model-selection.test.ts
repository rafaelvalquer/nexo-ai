import { describe, expect, it } from "vitest";
import {
  BROWSER_AGENT_MODEL_ENV,
  resolveBrowserAgentModel
} from "../../packages/browser-agent/src/model-selection";

describe("Browser Agent model selection", () => {
  it("keeps the global Nexo model when no browser override exists", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", undefined, {})).toEqual({model:"qwen3:4b",source:"global_setting"});
  });

  it("uses a dedicated Browser Agent model from the environment", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", undefined, {
      [BROWSER_AGENT_MODEL_ENV]:" qwen3:4b-instruct "
    })).toEqual({model:"qwen3:4b-instruct",source:`environment:${BROWSER_AGENT_MODEL_ENV}`});
  });

  it("lets an explicit browser-model override win over the environment", () => {
    expect(resolveBrowserAgentModel("qwen3:4b", "qwen3:8b", {
      [BROWSER_AGENT_MODEL_ENV]:"qwen3:4b-instruct"
    })).toEqual({model:"qwen3:8b",source:"explicit"});
  });

  it("rejects an invalid dedicated model without silently using the global model",()=>{
    expect(()=>resolveBrowserAgentModel("qwen3:4b",undefined,{[BROWSER_AGENT_MODEL_ENV]:"invalid model name"})).toThrow(/inválido.*environment:NEXO_BROWSER_AGENT_MODEL/i);
  });
});
