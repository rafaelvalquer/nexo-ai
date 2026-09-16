import {afterEach,describe,expect,it,vi} from "vitest";
import {BrowserAgentService} from "../../packages/core/src/browser-agent/service";

describe("Browser Agent first-action watchdog",()=>{
  afterEach(()=>vi.useRealTimers());
  it("cancels the watchdog when runner reports tool_execution_start through first_action_started",async()=>{
    vi.useFakeTimers();
    const db={run:vi.fn(),all:vi.fn(()=>[]),get:vi.fn()} as any;
    const service=new BrowserAgentService({dataDir:"C:\\temp\\nexo-browser-test",db,approvals:{} as any,security:{} as any,workerFactory:{} as any,settings:()=>({ollamaUrl:"http://127.0.0.1:11434",model:"qwen3:4b",allowedDomains:[],browserAutomationEnabled:true})});
    const run={id:"run-1",taskId:"task-1",conversationId:"conversation-1",request:"test",status:"starting",mode:"research",allowedDomains:["example.com"],stepCount:0,startedAt:new Date().toISOString()};
    const context={run,session:{close:vi.fn()},live:{stop:vi.fn()},worker:{stop:vi.fn()},approvalRequests:new Map()};
    (service as any).active.set(run.id,context);
    const finish=vi.spyOn(service as any,"finish");
    await (service as any).handleWorkerMessage(run.id,{type:"started",runId:run.id});
    await (service as any).handleWorkerMessage(run.id,{type:"diagnostic",runId:run.id,event:"first_model_response_started",durationMs:8});
    await vi.advanceTimersByTimeAsync(46_000);
    expect(finish).not.toHaveBeenCalled();
    await (service as any).handleWorkerMessage(run.id,{type:"diagnostic",runId:run.id,event:"first_model_response_completed",durationMs:60_000});
    await (service as any).handleWorkerMessage(run.id,{type:"diagnostic",runId:run.id,event:"first_action_started",durationMs:10});
    await vi.advanceTimersByTimeAsync(46_000);
    expect(context.firstActionAt).toBeDefined();expect(finish).not.toHaveBeenCalled();
  });
});
