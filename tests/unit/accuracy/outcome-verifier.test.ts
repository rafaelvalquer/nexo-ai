import {describe,expect,it} from "vitest";
import {OutcomeVerifier} from "../../../packages/core/src/agent/outcome/verifier.js";
const ok=(data:any)=>({success:true,ok:true,summary:"ok",data});
describe("OutcomeVerifier",()=>{
 it("marks web research partial when fewer items than requested",()=>{const out=new OutcomeVerifier().verify({userRequest:"traga 5 notícias",toolName:"web_research",result:ok({articles:[{url:"a"},{url:"b"}]})});expect(out.status).toBe("partial");if(out.status==="partial")expect(out.unmetGoals[0]).toContain("3");});
 it("requires message id for email send",()=>expect(new OutcomeVerifier().verify({userRequest:"envie",toolName:"email_send",result:ok({})}).status).toBe("failed"));
 it("accepts web research with evidence",()=>expect(new OutcomeVerifier().verify({userRequest:"traga notícias",toolName:"web_research",result:ok({headlines:[{url:"a"}]})}).status).toBe("success"));
});
