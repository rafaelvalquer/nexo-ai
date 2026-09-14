import { describe, expect, it } from "vitest";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router";

describe("Browser Agent deterministic routing", () => {
  const router=new FastIntentRouter();
  it("routes explicit InfoMoney research to browser_agent_run", () => {
    const plan=router.route("Pesquise no InfoMoney as 3 notícias mais recentes sobre a taxa Selic.");
    expect(plan).toMatchObject({tool:"browser_agent_run",input:{mode:"research"}});
    expect((plan as any).input.request).toContain("InfoMoney");
  });
  it("does not steal explicit email searches", () => {
    expect(router.route("Pesquise meus e-mails não lidos no Gmail")).toMatchObject({tool:"email_search"});
  });
  it("uses personal mode only for authenticated-account requests", () => {
    expect(router.route("Pesquise no LinkedIn usando minha conta as vagas de Node.js")).toMatchObject({tool:"browser_agent_run",input:{mode:"personal"}});
  });
});
