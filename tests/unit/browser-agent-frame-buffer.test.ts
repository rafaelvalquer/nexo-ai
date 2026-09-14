import { describe,expect,it } from "vitest";
import { LatestFrameBuffer } from "../../apps/desktop/renderer/components/chat/blocks/browser/latest-frame-buffer";

describe("Browser Agent live frame buffer",()=>{
  it("keeps only the newest frame when producer outruns renderer",()=>{
    const buffer=new LatestFrameBuffer();
    const frame=(sequence:number)=>({runId:"r",sequence,width:10,height:10,timestamp:sequence,bytes:new Uint8Array([sequence])});
    buffer.push(frame(1));buffer.push(frame(2));buffer.push(frame(3));
    expect(buffer.take()?.sequence).toBe(3);
    expect(buffer.take()).toBeNull();
  });
  it("does not let an old out-of-order frame replace a newer one",()=>{
    const buffer=new LatestFrameBuffer();
    const base={runId:"r",width:10,height:10,timestamp:0,bytes:new Uint8Array()};
    buffer.push({...base,sequence:5});buffer.push({...base,sequence:4});
    expect(buffer.take()?.sequence).toBe(5);
  });
});
