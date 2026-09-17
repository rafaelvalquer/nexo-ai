import { describe, expect, it } from "vitest";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router";
import { ToolRegistry } from "../../packages/core/src/tools/registry";

describe("Browser Agent deterministic routing", () => {
  const router=new FastIntentRouter();
  it("routes public InfoMoney research to the Web Reader", () => {
    const plan=router.route("Pesquise no InfoMoney as 3 notícias mais recentes sobre a taxa Selic.");
    expect(plan).toMatchObject({tool:"web_search",input:{maxResults:6}});
    expect((plan as any).input.query).toContain("InfoMoney");
  });
  it("reads explicit public pages without launching browser automation",()=>{expect(router.route("Resuma https://example.com/noticia")).toMatchObject({tool:"web_fetch",input:{url:"https://example.com/noticia"}});});
  it("dispatches a reviewed macro download deterministically through the tool registry",()=>{const input={selector:"#download",path:"C:\\Reports\\report.csv"};expect(router.route(`[[NEXO_TOOL:browser_download]] ${JSON.stringify(input)}`)).toMatchObject({tool:"browser_download",input});});
  it("dispatches macro click and input envelopes to explicit browser tools",()=>{expect(router.route(`[[NEXO_TOOL:browser_click]] ${JSON.stringify({selector:"#continue"})}`)).toMatchObject({tool:"browser_click",input:{selector:"#continue"}});expect(router.route(`[[NEXO_TOOL:browser_type]] ${JSON.stringify({selector:"input[name=email]",text:"user@example.com"})}`)).toMatchObject({tool:"browser_type",input:{selector:"input[name=email]",text:"user@example.com"}});});
  it("does not steal explicit email searches", () => {
    expect(router.route("Pesquise meus e-mails não lidos no Gmail")).toMatchObject({tool:"email_search"});
  });
  it("uses personal mode only for authenticated-account requests", () => {
    expect(router.route("Pesquise no LinkedIn usando minha conta as vagas de Node.js")).toMatchObject({tool:"browser_agent_run",input:{mode:"personal"}});
  });
  it("registers browser_agent_run as the public browser tool when the service is configured", () => {
    const registry=new ToolRegistry({browserAgent:{startOrSteer:async()=>({command:"started"})} as any});
    expect(registry.get("browser_agent_run")).toMatchObject({domain:"browser",mutatesState:false,permissions:["browser.use"]});
  });
});
