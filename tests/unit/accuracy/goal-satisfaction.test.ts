import {describe,expect,it} from "vitest";
import {GoalSatisfactionEvaluator} from "../../../packages/core/src/agent/decision/goal-satisfaction.js";
const candidate=(tool:string,mutatesState=false)=>({source:"exact" as const,domain:"web",operation:tool,entities:{},missing:[],ambiguities:[],confidence:.99,proposedTool:tool,mutatesState,evidence:[]});
describe("GoalSatisfactionEvaluator",()=>{
 it("rejects browser open for research goal",()=>expect(new GoalSatisfactionEvaluator().evaluate("acesse o InfoMoney e traga notícias",candidate("browser_open")).status).toBe("unsatisfied"));
 it("accepts web research for research goal",()=>expect(new GoalSatisfactionEvaluator().evaluate("acesse o InfoMoney e traga notícias",candidate("web_research")).status).toBe("satisfied"));
 it("rejects list for create folder goal",()=>expect(new GoalSatisfactionEvaluator().evaluate("crie pasta teste",candidate("list_files")).status).toBe("unsatisfied"));
 it("accepts create folder",()=>expect(new GoalSatisfactionEvaluator().evaluate("crie pasta teste",candidate("create_folder",true)).status).toBe("satisfied"));
});
