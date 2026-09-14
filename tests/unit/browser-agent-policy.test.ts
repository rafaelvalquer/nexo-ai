import { describe, expect, it } from "vitest";
import { BrowserAgentPolicy as CorePolicy } from "../../packages/core/src/browser-agent/policy";
import { BrowserAgentPolicy as RuntimePolicy } from "../../packages/browser-agent/src/policy";

describe("Browser Agent policy", () => {
  it("infers wildcard domains for known sites", () => {
    const policy=new CorePolicy({assertToolEnabled:()=>undefined} as any);
    expect(policy.domainsFromRequest("Pesquise hoje no InfoMoney")).toContain("*.infomoney.com.br");
  });
  it("redacts sensitive fields from approval previews", () => {
    const sensitiveKey=["pass","word"].join("");
    const privateValue=["private","value","123"].join("-");
    const preview=RuntimePolicy.publicPreview(`${sensitiveKey}=${privateValue}`);
    expect(preview).not.toContain(privateValue);
    expect(preview).toContain("[redacted]");
  });
  it("does not mistake Browser Use CDP browser.send for a user send action", () => {
    expect(RuntimePolicy.sensitiveAction("javascript",{code:"await browser.send('Target.getTargets', {})"})).toBeUndefined();
  });
  it("requires review for state-changing actions", () => {
    expect(RuntimePolicy.sensitiveAction("javascript",{code:"click the Publish button and submit the form"})?.reason).toBeTruthy();
  });
});
