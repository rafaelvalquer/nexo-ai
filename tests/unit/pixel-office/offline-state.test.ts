import{describe,expect,it}from"vitest";import{transition}from"../../../apps/desktop/renderer/pixel-office/agent/AgentStateMachine";import{event}from"./fixtures";
describe("offline",()=>{it("bloqueia trabalho até agent.online",()=>{expect(transition("offline",event("tool.started"))).toBe("offline");expect(transition("offline",event("agent.online",{state:"idle"}))).toBe("idle");});});
