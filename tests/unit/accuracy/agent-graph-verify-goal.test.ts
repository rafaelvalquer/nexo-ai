import {describe,expect,it} from "vitest";
import {verifyGoalNode} from "../../../packages/core/src/agent/graph/nodes/verify-goal.js";
function state(count:number){
 const now=new Date().toISOString();
 return{runId:"r",stage:"OBSERVE" as const,error:undefined,loopState:{version:2 as const,runId:"r",userRequest:"traga 5 notícias",messages:[],observations:[{toolCallId:"c",toolName:"web_research",ok:true,summary:"ok",data:{articles:[{url:"a"},{url:"b"}]},trust:"UNTRUSTED_CONTENT" as const,truncated:false}],iteration:1,toolCallCount:1,consecutiveFailures:0,protocolRepairCount:0,actionFingerprints:[],observationFingerprints:[],activeToolNames:[],startedAt:now,updatedAt:now,deadlineAt:new Date(Date.now()+10000).toISOString(),status:"COMPLETED" as const,correctionRounds:count}};
}
describe("verify_goal",()=>{
 it("routes partial goal back for correction",async()=>{const result=await verifyGoalNode()(state(0));expect(result.loopState?.goalOutcome?.status).toBe("partial");expect(result.loopState?.status).toBe("DECIDING");expect(result.loopState?.correctionRounds).toBe(1);});
 it("stops after two correction rounds",async()=>{const result=await verifyGoalNode()(state(2));expect(result.loopState?.status).toBe("FAILED");});
});
