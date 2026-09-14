import { describe, expect, it, vi } from "vitest";
import { BrowserAgentWorkerController } from "../../packages/core/src/browser-agent/worker-controller";

describe("BrowserAgentWorkerController",()=>{
  it("waits for ready before accepting commands",async()=>{
    let messageListener:(message:any)=>void=()=>{};
    const postMessage=vi.fn();
    const controller=new BrowserAgentWorkerController(()=>({postMessage,kill:()=>true,onMessage:listener=>{messageListener=listener;return()=>{};},onExit:()=>()=>{}}));
    const ready=controller.start(()=>{},()=>{});
    expect(()=>controller.send({type:"cancel",runId:"x"})).toThrow(/indisponível/);
    messageListener({type:"ready",nodeVersion:"22.20.0"});
    await ready;
    controller.send({type:"cancel",runId:"x"});
    expect(postMessage).toHaveBeenCalledWith({type:"cancel",runId:"x"});
  });
});
