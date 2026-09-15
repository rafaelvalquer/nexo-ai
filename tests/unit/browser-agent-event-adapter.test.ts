import { describe, expect, it } from "vitest";
import { BrowserPublicEventMapper } from "../../packages/browser-agent/src/event-adapter";

describe("Browser Agent public event mapper",()=>{
  it("emits only generic public progress",()=>{
    const mapper=new BrowserPublicEventMapper();
    const privateValue=["private","marker","123"].join("-");
    const mapped=mapper.map({type:"tool_execution_start",toolName:"javascript",args:{code:`await page.goto('https://example.com'); /* ${privateValue} */`}});
    expect(mapped?.label).toBe("Abrindo página…");
    expect(mapped?.action).toBe(true);
    expect(JSON.stringify(mapped)).not.toContain(privateValue);
  });
  it("does not classify turn lifecycle events as browser actions",()=>{
    const mapped=new BrowserPublicEventMapper().map({type:"turn_start"});
    expect(mapped).toMatchObject({label:"Analisando a página…",action:false});
  });
  it("drops model content events",()=>expect(new BrowserPublicEventMapper().map({type:"message_update",content:"private"})).toBeUndefined());
});
