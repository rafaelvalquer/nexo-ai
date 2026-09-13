import{describe,expect,it}from"vitest";import{VisualStreamingGate}from"../../../packages/core/src/agent/visual-events/streaming-gate";
describe("streaming visual",()=>{it("mil tokens iniciam apenas um evento visual",()=>{const gate=new VisualStreamingGate();let events=0;for(let i=0;i<1000;i++)if(gate.start())events++;expect(events).toBe(1);});});
