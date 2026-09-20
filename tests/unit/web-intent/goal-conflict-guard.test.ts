import {describe,expect,it} from "vitest";
import {WebGoalConflictGuard} from "../../../packages/core/src/intent/web/goal-conflict-guard.js";
describe("WebGoalConflictGuard",()=>{
  const guard=new WebGoalConflictGuard();
  it("rejects browser_open when the final goal is information",()=>expect(guard.evaluate("acesse o InfoMoney e traga as notícias",{type:"tool",tool:"browser_open"})).toMatchObject({accepted:false,reason:"information_goal_present"}));
  it("rejects shallow web_search when the user expects sources to be read",()=>expect(guard.evaluate("pesquise as principais notícias no InfoMoney",{type:"tool",tool:"web_search"})).toMatchObject({accepted:false,reason:"research_requires_source_reading"}));
  it("keeps simple navigation terminal",()=>expect(guard.evaluate("abra o InfoMoney para eu ver",{type:"tool",tool:"browser_open"})).toEqual({accepted:true}));
  it("keeps browser interaction terminal",()=>expect(guard.evaluate("entre no InfoMoney e clique em Mercados",{type:"tool",tool:"browser_agent_run"})).toEqual({accepted:true}));
});
