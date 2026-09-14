import { describe, expect, it } from "vitest";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder";

describe("Browser Agent chat presentation",()=>{
  it("creates browser_run block for a started run",()=>{
    const builder=new ChatPresentationBuilder();
    const record=builder.fromToolResult("browser_agent_run",{ok:true,summary:"iniciado",data:{command:"started",run:{id:"run-1",taskId:"task-1",conversationId:"c-1",request:"Pesquise no InfoMoney",status:"running",mode:"research",allowedDomains:["*.infomoney.com.br"],stepCount:0,startedAt:new Date().toISOString()}}} as any);
    expect(record.presentation.blocks[0]).toMatchObject({type:"browser_run",runId:"run-1",status:"running"});
  });
});
