import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentLoop } from "../../packages/core/src/agent/loop/agent-loop.js";
import { AgentLoopRunner } from "../../packages/core/src/agent/loop/agent-loop-runner.js";
import { V2FastPathRouter } from "../../packages/core/src/agent/loop/v2-fast-path.js";
import { ToolCandidateSelector } from "../../packages/core/src/agent/orchestrator/tool-candidate-selector.js";
import { CapabilityAwareToolCatalog, type AgentToolDescriptor } from "../../packages/core/src/agent/orchestrator/tool-catalog.js";
import { encodeObservation } from "../../packages/core/src/agent/loop/observation-encoder.js";
import type { AgentLoopDependencies } from "../../packages/core/src/agent/loop/types.js";
import type { PreparedAction } from "../../packages/core/src/agent/execution/types.js";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { createAgentToolSchemas } from "../../packages/core/src/llm/agent/tool-schema-factory.js";
import { OllamaProvider } from "../../packages/core/src/llm/ollama.js";
import { AgentPlanner } from "../../packages/core/src/agent/planner.js";
import { AgentEngine } from "../../packages/core/src/agent/engine.js";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ApprovalService } from "../../packages/core/src/permissions/approvals.js";
import { AuditService } from "../../packages/core/src/audit/audit.js";
import { z } from "zod";

function tool(name:string,domain:string,mutatesState=false):AgentToolDescriptor{return{name,description:`Tool ${name}`,domain,operation:name,risk:mutatesState?"WRITE":"READ",mutatesState,requiresConfirmation:mutatesState,permissions:[],parameters:{type:"object",properties:{}}};}

function connectionHarness() {
  const connectionId = "11111111-1111-4111-8111-111111111111";
  const capabilities = ["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"];
  const account = { id: connectionId, status: "connected", capabilities };
  const connections = {
    get: (id:string) => id === connectionId ? account : undefined,
    resolveForCapability: (capability:string) => capabilities.includes(capability) ? { status: "ready", account } : { status: "not_connected" }
  } as any;
  return { connectionId, account, connections };
}

afterEach(()=>vi.unstubAllGlobals());

describe("Agent V2 routing",()=>{
  it("limits the model catalog while keeping system tools for computer analysis",()=>{
    const tools=[...Array.from({length:20},(_,i)=>tool(`email_tool_${i}`,"email")),tool("daily_summary","system"),tool("system_info","system"),tool("memory_usage","system"),tool("disk_usage","system"),tool("process_list","system")];
    const selected=new ToolCandidateSelector(10).select("Analise meu computador",tools);
    expect(selected.length).toBeLessThanOrEqual(10);
    expect(selected.map(item=>item.name)).toEqual(expect.arrayContaining(["daily_summary","system_info","memory_usage","disk_usage","process_list"]));
  });

  it("uses a deterministic read-only fast path for simple local tasks",()=>{
    const router=new V2FastPathRouter();
    const tools=[tool("daily_summary","system"),tool("list_files","filesystem"),tool("email_latest","email"),tool("browser_agent_run","browser"),tool("web_search","web"),tool("web_fetch","web")];
    expect(router.resolve("Analise meu computador",tools)?.name).toBe("daily_summary");
    expect(router.resolve("Liste os arquivos na pasta Downloads",tools)?.name).toBe("list_files");
    expect(router.resolve("Qual foi meu último email?",tools)?.name).toBe("email_latest");
    expect(router.resolve("Entre no site InfoMoney e veja as últimas notícias",tools)?.name).toBe("web_search");
  });

  it("routes common macro steps directly to their tools",()=>{
    const router=new V2FastPathRouter();
    const tools=[tool("open_application","system",true),tool("open_path","filesystem",true),tool("open_url","browser",true),tool("move_file","filesystem",true),tool("copy_file","filesystem",true),tool("rename_file","filesystem",true),tool("create_folder","filesystem",true),tool("web_fetch","web")];
    expect(router.resolve("Abra o aplicativo vscode",tools)).toMatchObject({name:"open_application",arguments:{application:"vscode"}});
    expect(router.resolve('Abra o caminho "C:\\Projetos\\nexo"',tools)).toMatchObject({name:"open_path",arguments:{path:"C:\\Projetos\\nexo"}});
    expect(router.resolve('Mova o arquivo "C:\\Downloads\\relatorio.csv" para "C:\\Relatorios\\relatorio.csv"',tools)).toMatchObject({name:"move_file",arguments:{source:"C:\\Downloads\\relatorio.csv",destination:"C:\\Relatorios\\relatorio.csv"}});
    expect(router.resolve('Copie o arquivo "C:\\Downloads\\relatorio.csv" para "C:\\Relatorios\\relatorio.csv"',tools)).toMatchObject({name:"copy_file",arguments:{source:"C:\\Downloads\\relatorio.csv",destination:"C:\\Relatorios\\relatorio.csv"}});
    expect(router.resolve('Renomeie o arquivo "C:\\Relatorios\\a.csv" para "C:\\Relatorios\\b.csv"',tools)).toMatchObject({name:"rename_file",arguments:{path:"C:\\Relatorios\\a.csv",newPath:"C:\\Relatorios\\b.csv"}});
    expect(router.resolve('Crie a pasta "C:\\Relatorios\\2026"',tools)).toMatchObject({name:"create_folder",arguments:{path:"C:\\Relatorios\\2026"}});
    expect(router.resolve("Leia https://example.com/artigo",tools)).toMatchObject({name:"web_fetch",arguments:{url:"https://example.com/artigo"}});
  });

  it("plans macro browser downloads without asking the LLM to choose the tool",async()=>{
    const llm={plan:vi.fn(async()=>{throw new Error("LLM should not be called for a structured macro action");})} as any,registry=new ToolRegistry();const input={selector:"#download",path:"C:\\Reports\\daily.csv"};const plan=await new AgentPlanner(llm,registry).plan(`[[NEXO_TOOL:browser_download]] ${JSON.stringify(input)}`);
    expect(plan).toMatchObject({tool:"browser_download",input,origin:"fast"});expect(llm.plan).not.toHaveBeenCalled();
  });

  it("routes macro browser actions before Agent Loop and still requests exact approval",async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-macro-browser-route-"));
    try{
      const db=new NexoDatabase(root);await db.ready();const approvals=new ApprovalService(db),execute=vi.fn(async()=>({ok:true,summary:"executed"}));
      const registry=new ToolRegistry().register({name:"browser_click",description:"Clica na página",risk:"CRITICAL",permissions:["browser.interact"],mutatesState:true,inputSchema:z.object({selector:z.string()}),execute});
      const llm={plan:vi.fn(async()=>{throw new Error("Agent Loop must not plan an explicit macro step");})} as any,planner=new AgentPlanner(llm,registry),settings={allowedRoots:[],autonomy:"balanced"} as any;
      const engine=new AgentEngine(planner,registry,new PermissionEngine(()=>settings),approvals,new AuditService(db),undefined,undefined,undefined,undefined,undefined,undefined,()=>"full");
      const input={selector:"#continue"},reply=await engine.run(`[[NEXO_TOOL:browser_click]] ${JSON.stringify(input)}`);
      expect(reply.approvalId).toBeTruthy();expect(approvals.list()[0]).toMatchObject({toolName:"browser_click",input,status:"pending"});expect(llm.plan).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
    }finally{fs.rmSync(root,{recursive:true,force:true});}
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

  it("hides connectionId from Email/Calendar agent schemas while keeping it required internally",()=>{
    const { connections } = connectionHarness();
    const registry = new ToolRegistry(undefined, {} as any, {} as any);
    const schemas = createAgentToolSchemas(new CapabilityAwareToolCatalog(registry, connections).list());

    for (const name of ["email_send_composed", "calendar_create"]) {
      const exposed = schemas.find(schema => schema.name === name);
      expect(exposed).toBeDefined();
      expect((exposed!.parameters as any)?.properties?.connectionId).toBeUndefined();
      expect((exposed!.parameters as any)?.required ?? []).not.toContain("connectionId");
      const internal = registry.get(name);
      expect(internal).toBeDefined();
      expect(internal!.inputSchema.safeParse({}).success).toBe(false);
    }
  });

  it("resolves email.send in Core when the model omits connectionId and reaches WAITING_APPROVAL",async()=>{
    const { connectionId, connections } = connectionHarness();
    const registry = new ToolRegistry(undefined, {} as any);
    const catalog = new CapabilityAwareToolCatalog(registry, connections);
    const executor = new ActionExecutor(
      registry,
      { requiresApproval:(risk:string)=>risk==="CRITICAL", assertPath:()=>undefined, allowedRoots:()=>[] } as any,
      { record:()=>undefined } as any,
      { connections }
    );
    const llm = {
      agentTurn: async()=>({
        toolCalls:[{
          id:"send-1",
          name:"email_send_composed",
          arguments:{to:[{email:"rafael.valquer@gmail.com"}],subject:"Oi",bodyText:"Oi"}
        }]
      })
    } as any;

    const state = await new AgentLoopRunner(llm,catalog,registry,executor,connections).run(
      "Envie e-mail para rafael.valquer@gmail.com falando Oi",
      { mode:"full", conversationId:"conversation-email" }
    );

    expect(state.status).toBe("WAITING_APPROVAL");
    expect(state.pendingAction?.toolName).toBe("email_send_composed");
    expect(state.pendingAction?.input.connectionId).toBe(connectionId);
    const assistantCall = state.messages.find(message=>message.role==="assistant"&&message.toolCalls?.[0]?.name==="email_send_composed");
    expect(assistantCall?.toolCalls?.[0]?.arguments).not.toHaveProperty("connectionId");
  });

  it("ignores a connectionId invented by the model and resolves the authorized account in Core",async()=>{
    const { connectionId, connections } = connectionHarness();
    const registry = new ToolRegistry(undefined, {} as any);
    const catalog = new CapabilityAwareToolCatalog(registry, connections);
    const executor = new ActionExecutor(registry,{requiresApproval:(risk:string)=>risk==="CRITICAL",assertPath:()=>undefined,allowedRoots:()=>[]} as any,{record:()=>undefined} as any,{connections});
    const llm={agentTurn:async()=>({toolCalls:[{id:"send-2",name:"email_send_composed",arguments:{connectionId:"nexus-ai",to:[{email:"rafael.valquer@gmail.com"}],subject:"Oi",bodyText:"Oi"}}]})} as any;

    const state=await new AgentLoopRunner(llm,catalog,registry,executor,connections).run("Envie e-mail para rafael.valquer@gmail.com falando Oi",{mode:"full"});
    expect(state.status).toBe("WAITING_APPROVAL");
    expect(state.pendingAction?.input.connectionId).toBe(connectionId);
  });

  it("sanitizes reasoning returned in Ollama content before exposing the final answer",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({
      ok:true,
      status:200,
      json:async()=>({message:{content:"Okay, let me reason about this first.\n</think>\nResposta final limpa."}})
    })));
    const provider=new OllamaProvider("http://localhost:11434","qwen3:4b");
    const turn=await provider.agentTurn!({messages:[{role:"user",content:"teste"}],tools:[]});
    expect(turn.content).toBe("Resposta final limpa.");
    expect(turn.toolCalls).toEqual([]);
  });

  it("discards assistant content whenever Ollama returns native tool_calls",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({
      ok:true,
      status:200,
      json:async()=>({message:{content:"<think>conteúdo que não deve aparecer</think>",tool_calls:[{id:"c1",function:{name:"lookup",arguments:{id:"42"}}}]}})
    })));
    const provider=new OllamaProvider("http://localhost:11434","qwen3:4b");
    const turn=await provider.agentTurn!({messages:[{role:"user",content:"teste"}],tools:[{name:"lookup",description:"Lookup",parameters:{type:"object",properties:{id:{type:"string"}}}}]});
    expect(turn.content).toBeUndefined();
    expect(turn.toolCalls).toEqual([{id:"c1",name:"lookup",arguments:{id:"42"}}]);
  });

  it("sanitizes hidden reasoning again at the AgentLoop finalResponse boundary",async()=>{
    const deps:AgentLoopDependencies={
      agentTurn:async()=>({content:"internal chain\n</think>\nSomente a resposta final.",toolCalls:[]}),
      tools:()=>[],
      preflight:async()=>({ok:false,code:"TOOL_NOT_FOUND",message:"unused"}),
      execute:async()=>{throw new Error("unused");},
      observe:()=>{throw new Error("unused");}
    };
    const state=await new AgentLoop(deps).run("responda");
    expect(state.status).toBe("COMPLETED");
    expect(state.finalResponse).toBe("Somente a resposta final.");
  });
});
