import { describe, expect, it } from "vitest";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder";
import { parsePresentation } from "../../packages/core/src/chat/presentation/types";

describe("Browser Agent chat presentation",()=>{
  it("creates browser_run block for a started run without faking running state",()=>{
    const builder=new ChatPresentationBuilder();
    const record=builder.fromToolResult("browser_agent_run",{ok:true,summary:"iniciado",data:{command:"started",run:{id:"run-1",taskId:"task-1",conversationId:"c-1",request:"Pesquise no InfoMoney",status:"starting",phase:"loading_agent",mode:"research",allowedDomains:["*.infomoney.com.br"],stepCount:0,startedAt:new Date().toISOString()}}} as any);
    expect(record.presentation.blocks[0]).toMatchObject({type:"browser_run",runId:"run-1",status:"starting"});
    expect(parsePresentation(record.presentation)?.blocks[0]).toMatchObject({type:"browser_run",runId:"run-1",status:"starting"});
  });
  it("keeps running after the agent reports readiness",()=>{
    const builder=new ChatPresentationBuilder();
    const record=builder.fromToolResult("browser_agent_run",{ok:true,summary:"iniciado",data:{command:"started",run:{id:"run-2",taskId:"task-2",conversationId:"c-2",request:"Abra example.com",status:"running",phase:"executing",mode:"research",allowedDomains:["*.example.com"],stepCount:1,startedAt:new Date().toISOString()}}} as any);
    expect(record.presentation.blocks[0]).toMatchObject({type:"browser_run",runId:"run-2",status:"running"});
    expect(parsePresentation(record.presentation)?.blocks[0]).toMatchObject({type:"browser_run",runId:"run-2",status:"running"});
  });
});
