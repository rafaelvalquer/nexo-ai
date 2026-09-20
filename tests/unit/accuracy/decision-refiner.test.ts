import {describe,expect,it} from "vitest";
import {DecisionRefiner} from "../../../packages/core/src/agent/decision/decision-refiner.js";
import type {DecisionCandidate} from "../../../packages/core/src/agent/decision/types.js";
const c=(tool:string,missing:string[]=[],mutatesState=false):DecisionCandidate=>({source:"exact",domain:"filesystem",operation:tool,entities:{},missing,ambiguities:[],confidence:.99,proposedTool:tool,mutatesState,evidence:[]});
describe("DecisionRefiner",()=>{
 it("rejects candidate with missing critical entity",()=>{const r=new DecisionRefiner().refine({current:c("create_folder",["folder"],true)});expect(r.clarificationNeeded).toBe(true);expect(r.rejectedCandidates[0]?.reason).toContain("MISSING");});
 it("does not execute weak-context mutation",()=>{const candidate={...c("trash_file",[],true),entities:{path:"C:/x.txt"}};const r=new DecisionRefiner().refine({current:candidate,context:[{field:"path",value:"C:/x.txt",source:"conversation_history",confidence:.5}]});expect(r.clarificationNeeded).toBe(true);});
});
