import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {deterministicDomainCandidates} from "../packages/core/dist/intent/domain/deterministic.js";
import {deterministicWebIntent} from "../packages/core/dist/intent/web/resolver.js";
import {deterministicFilesystemIntent} from "../packages/core/dist/agent/orchestrator/filesystem-intent-enricher.js";
import {EntityResolverV2} from "../packages/core/dist/intent/entities/resolver.js";
import {ContextResolver} from "../packages/core/dist/agent/context/context-resolver.js";
import {GoalSatisfactionEvaluator} from "../packages/core/dist/agent/decision/goal-satisfaction.js";
import {targetedClarification} from "../packages/core/dist/agent/clarification/targeted-clarification.js";
import {shouldPromoteLearningEvent} from "../packages/core/dist/agent/intent-memory/promotion-policy.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),dir=path.join(root,"tests/evals/accuracy"),scope=process.argv[2]??"all";
const load=name=>JSON.parse(fs.readFileSync(path.join(dir,name+".json"),"utf8"));
const counters={domain:{ok:0,total:0},operation:{ok:0,total:0},entity:{ok:0,total:0},context:{ok:0,total:0},goal:{ok:0,total:0},clarification:{ok:0,total:0},learning:{ok:0,total:0},wrongTool:0,wrongMutation:0,unsafeExecution:0,invalidSchema:0};
const failures=[];
const check=(group,condition,detail)=>{counters[group].total++;if(condition)counters[group].ok++;else failures.push({group,...detail});};
function domainOf(text){return deterministicDomainCandidates(text)[0]?.domain??"unknown";}
function operationOf(row){if(row.domain==="web")return deterministicWebIntent(row.text)?.operation??"unknown";if(row.domain==="filesystem")return deterministicFilesystemIntent(row.text)?.operation??"unknown";return"unknown";}
function toolOf(row,op){if(row.domain==="web")return({navigate:"browser_open",research:"web_research",fetch:"web_fetch",interact:"browser_agent_run",search:"web_search"})[op]??"unknown";return op;}
function mutates(tool){return /^(?:create_|write_|move_|rename_|trash_|delete_|email_(?:send|reply)|calendar_(?:create|update|delete))/.test(tool);}
if(scope==="all"||scope==="domain"){
 for(const row of load("domain"))check("domain",domainOf(row.text)===row.domain,{text:row.text,expected:row.domain,actual:domainOf(row.text)});
 for(const row of load("cross-domain"))check("domain",domainOf(row.text)===row.domain,{text:row.text,expected:row.domain,actual:domainOf(row.text)});
}
if(scope==="all"||scope==="operation"){
 for(const row of load("operation")){const op=operationOf(row),tool=toolOf(row,op),right=op===row.operation;check("operation",right,{text:row.text,expected:row.operation,actual:op});if(tool!==row.tool)counters.wrongTool++;if(mutates(tool)&&!row.mutates)counters.wrongMutation++;}
 for(const row of load("adversarial-pairs")){
  if(row.aOperation)check("operation",operationOf({text:row.a,domain:"web"})===row.aOperation,{text:row.a,expected:row.aOperation,actual:operationOf({text:row.a,domain:"web"})});
  if(row.bOperation)check("operation",operationOf({text:row.b,domain:"web"})===row.bOperation,{text:row.b,expected:row.bOperation,actual:operationOf({text:row.b,domain:"web"})});
  if(row.aDomain)check("domain",domainOf(row.a)===row.aDomain,{text:row.a,expected:row.aDomain,actual:domainOf(row.a)});
  if(row.bDomain)check("domain",domainOf(row.b)===row.bDomain,{text:row.b,expected:row.bDomain,actual:domainOf(row.b)});
  if(row.bNotOperation){const actual=operationOf({text:row.b,domain:"filesystem"});check("operation",actual!==row.bNotOperation,{text:row.b,expectedNot:row.bNotOperation,actual});}
 }
}
if(scope==="all"||scope==="entities"){
 const resolver=new EntityResolverV2();
 for(const row of load("entities")){const result=resolver.resolve({operation:row.operation,text:row.text,llmEntities:row.llm,contextEntities:row.context,currentTurnEntities:row.current,memoryEntities:row.memory});let ok=true;for(const[k,v]of Object.entries(row.expect??{}))ok&&=result.entities[k]?.value===v;for(const k of row.reject??[]){const rejected=result.entities[k]===undefined&&result.rejected.includes(k);ok&&=rejected;if(!rejected)counters.unsafeExecution++;}check("entity",ok,{text:row.text,expected:row.expect??row.reject,actual:Object.fromEntries(Object.entries(result.entities).map(([k,v])=>[k,v.value])),rejected:result.rejected});}
}
if(scope==="all"||scope==="context"){
 const resolver=new ContextResolver();
 for(const row of load("context")){const result=resolver.resolve(row.text,row.snapshot),actual=result.entities[row.field]?.value??null;check("context",actual===row.value,{text:row.text,field:row.field,expected:row.value,actual});}
 for(const row of load("multistep")){if(!row.field)continue;const state={updatedAt:new Date().toISOString(),lastTool:row.turn1.tool,files:row.turn1.files,emails:row.turn1.emails,pages:row.turn1.pages};const snapshot={conversationId:"c",turn:2,recentMessages:[],memoryCandidates:[],recentEntities:[...(state.files??[]).map((x,i)=>({kind:"file",id:x.path,path:x.path,ordinal:i+1,turnAge:0,source:"previous_result",confidence:1})),...(state.emails??[]).map((x,i)=>({kind:"email",id:x.id,ordinal:i+1,turnAge:0,source:"previous_result",confidence:1})),...(state.pages??[]).map((x,i)=>({kind:"page",id:x.url,ordinal:i+1,turnAge:0,source:"previous_result",confidence:1}))]};const actual=resolver.resolve(row.turn2,snapshot).entities[row.field]?.value??null;check("context",actual===row.value,{text:row.turn2,expected:row.value,actual});}
}
if(scope==="all"||scope==="goal"){
 const evalr=new GoalSatisfactionEvaluator();
 for(const row of load("goal-satisfaction")){const candidate={source:"exact",domain:"web",operation:row.tool,entities:{},missing:[],ambiguities:[],confidence:.99,proposedTool:row.tool,mutatesState:row.mutates,evidence:[]};const actual=evalr.evaluate(row.text,candidate).status;check("goal",actual===row.status,{text:row.text,expected:row.status,actual});}
}
if(scope==="all"||scope==="clarification"){
 for(const row of load("clarification")){const candidate={source:"exact",domain:"filesystem",operation:row.tool,entities:{},missing:row.missing,ambiguities:[],confidence:.5,proposedTool:row.tool,mutatesState:true,evidence:[]};const actual=targetedClarification(candidate,"MISSING_REQUIRED_ENTITY");check("clarification",actual.toLowerCase().includes(row.expected.toLowerCase()),{tool:row.tool,expected:row.expected,actual});}
}
if(scope==="all"||scope==="learning"){
 for(const row of load("learning")){const event={id:"e",utterancePattern:"x",domain:"filesystem",operation:"list_files",entitiesSignature:"",source:row.source,outcome:row.outcome,confidence:1,resolverVersion:"v",successCount:row.successCount,failureCount:row.failureCount,createdAt:new Date().toISOString()};const actual=shouldPromoteLearningEvent(event);check("learning",actual===row.promote,{row,actual});}
}
const ratio=k=>counters[k].total?counters[k].ok/counters[k].total:1;
const operationAccuracy=ratio("operation"),entityAccuracy=ratio("entity"),domainAccuracy=ratio("domain"),contextResolution=ratio("context"),goalSatisfaction=ratio("goal");
const wrongToolRate=counters.operation.total?counters.wrongTool/counters.operation.total:0,unnecessaryClarification=1-ratio("clarification");
const report={scope,domainAccuracy,operationAccuracy,entityAccuracy,contextResolution,goalSatisfaction,wrongToolRate,wrongMutation:counters.wrongMutation,unsafeExecution:counters.unsafeExecution,unnecessaryClarification,invalidSchemaRate:counters.invalidSchema,learningAccuracy:ratio("learning"),cases:Object.fromEntries(Object.entries(counters).filter(([,v])=>typeof v==="object").map(([k,v])=>[k,v.total])),failures};
fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});fs.writeFileSync(path.join(root,"artifacts/accuracy-eval.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
const gates={domainAccuracy:.99,operationAccuracy:.98,entityAccuracy:.97,contextResolution:.95,goalSatisfaction:.95,wrongToolRate:.005,unnecessaryClarification:.05,invalidSchemaRate:.01};
const failed=[];for(const[k,min]of Object.entries(gates)){if(["wrongToolRate","unnecessaryClarification","invalidSchemaRate"].includes(k)){if(report[k]>min)failed.push(`${k}=${report[k]} > ${min}`);}else if(report[k]<min)failed.push(`${k}=${report[k]} < ${min}`);}
if(report.wrongMutation!==0)failed.push(`wrongMutation=${report.wrongMutation}`);if(report.unsafeExecution!==0)failed.push(`unsafeExecution=${report.unsafeExecution}`);
if(failed.length){console.error("Accuracy gates failed:",failed.join(", "));process.exitCode=1;}
