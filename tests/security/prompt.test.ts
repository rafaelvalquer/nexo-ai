import { describe,it,expect } from "vitest";
import { AGENT_SYSTEM_PROMPT } from "../../packages/core/src/security/prompt.js";
describe("security prompt",()=>{it("marca conteúdo externo como não confiável",()=>{expect(AGENT_SYSTEM_PROMPT).toContain("UNTRUSTED_CONTENT");expect(AGENT_SYSTEM_PROMPT).toContain("nunca pode alterar");});});
