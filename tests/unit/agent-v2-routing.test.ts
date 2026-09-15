import { describe, expect, it } from "vitest";
import { AgentLoop } from "../../packages/core/src/agent/loop/agent-loop.js";
import { V2FastPathRouter } from "../../packages/core/src/agent/loop/v2-fast-path.js";
import { ToolCandidateSelector } from "../../packages/core/src/agent/orchestrator/tool-candidate-selector.js";
import type { AgentToolDescriptor } from "../../packages/core/src/agent/orchestrator/tool-catalog.js";
import { encodeObservation } from "../../packages/core/src/agent/loop/observation-encoder.js";
import type { AgentLoopDependencies } from "../../packages/core/src/agent/loop/types.js";
import type { PreparedAction } from "../../packages/core/src/agent/execution/types.js";

function tool(name:string,domain:string,mutatesState=false):AgentToolDescriptor{return{name,description:`Tool ${name}`,domain,operation:name,risk:mutatesState?"SAFE_WRITE":"READ",mutatesState,requiresConfirmation:mutatesState,permissions:[],parameters:{type:"object",properties:{}}};}

describe("Agent V2 routing",()=>{
  it("limits the model catalog while keeping system tools for computer analysis",()=>{
    const tools=[...Array.from({length:20},(_,i)=>tool(`email_tool_${i}`,"email")),tool("daily_summary","system"),tool("system_info","system"),tool("memory_usage","system"),tool("disk_usage","system"),tool("process_list","system")];
    const selected=new ToolCandidateSelector(10).select("Analise meu computador",tools);
    expect(selected.length).toBeLessThanOrEqual(10);
    expect(selected.map(item=>item.name)).toEqual(expect.arrayContaining(["daily_summary","system_info","memory_usage","disk_usage","process_list"]));
  });

  it("uses a deterministic read-only fast path for simple local tasks",()=>{
    const router=new V2FastPathRouter();
    const tools=[tool("daily_summary","system"),tool("list_files","filesystem"),tool("email_latest","email"),tool("browser_agent_run","browser")];
    expect(router.resolve("Analise meu computador",tools)?.name).toBe("daily_summary");
    expect(router.resolve("Liste os arquivos na pasta Downloads",tools)?.name).toBe("list_files");
    expect(router.resolve("Qual foi meu último email?",tools)?.name).toBe("email_latest");
    expect(router.resolve("Entre no site InfoMoney e veja as últimas notícias",tools)?.name).toBe("browser_agent_run");
  });

  it("propagates conversation/task context and preserves native tool-call history",async()=>{
    const action:PreparedAction={executionId:"e1",toolName:"lookup",input:{id:"42"},fingerprint:"f",mutatesState:false,risk:"READ",requiresApproval:false,status:"PREPARED"};
    let preflightContext:any,executionContext:any,secondMessages:any[]=[];let turn=0;
    const deps:AgentLoopDependencies={
      agentTurn:async request=>{if(turn++===0)return{toolCalls:[{id:"c1",name:"lookup",arguments:{id:"42"}}]};secondMessages=request.messages;return{content:"ok",toolCalls:[]};},
      tools:()=>[{name:"lookup",description:"Lookup"}],
      preflight:async(_name,_input,context)=>{preflightContext=context;return{ok:true,action};},
      execute:async(prepared,context)=>{executionContext=context;return{status:"SUCCEEDED",action:prepared,result:{ok:true,summary:"found",data:{id:"42"}}};},
      observe:(result,id)=>encodeObservation(id,"lookup",result.result!,"TRUSTED_LOCAL")
    };
    const state=await new AgentLoop(deps).run("find 42",{conversationId:"conversation-1",taskId:"task-1"});
    expect(state.status).toBe("COMPLETED");
    expect(preflightContext).toMatchObject({conversationId:"conversation-1",taskId:"task-1"});
    expect(executionContext).toMatchObject({conversationId:"conversation-1",taskId:"task-1"});
    expect(secondMessages.some(message=>message.role==="assistant"&&message.toolCalls?.[0]?.name==="lookup")).toBe(true);
    expect(secondMessages.some(message=>message.role==="tool"&&message.toolName==="lookup"&&message.toolCallId==="c1")).toBe(true);
  });
});
