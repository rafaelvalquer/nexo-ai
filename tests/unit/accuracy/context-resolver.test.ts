import {describe,expect,it} from "vitest";
import {ContextResolver} from "../../../packages/core/src/agent/context/context-resolver.js";
describe("ContextResolver",()=>{
 it("resolves ordinal from immediately previous results",()=>{const result=new ContextResolver().resolve("abra o segundo",{conversationId:"c",turn:2,recentMessages:[],memoryCandidates:[],recentEntities:[{kind:"file",id:"a",path:"C:/Downloads/a.txt",ordinal:1,turnAge:0,source:"previous_result",confidence:1},{kind:"file",id:"b",path:"C:/Downloads/b.txt",ordinal:2,turnAge:0,source:"previous_result",confidence:1}]});expect(result.entities.path?.value).toContain("b.txt");});
 it("rejects stale previous result",()=>{const result=new ContextResolver().resolve("abra ele",{conversationId:"c",turn:5,recentMessages:[],memoryCandidates:[],recentEntities:[{kind:"file",id:"a",path:"C:/Downloads/a.txt",turnAge:3,source:"previous_result",confidence:1}]});expect(result.entities.path).toBeUndefined();});
});
