import{describe,expect,it}from"vitest";import{STATE_DURATION}from"../../../apps/desktop/renderer/pixel-office/agent/AgentActionQueue";
describe("estados transitórios",()=>{it("define retorno automático ao idle",()=>expect(STATE_DURATION).toEqual({success:700,error:1400,cancelled:1000}));});
