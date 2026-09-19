import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {CommandService} from "../../../packages/core/src/application/command-service.js";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";
import {HybridIntentResolver} from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import {IntentToolMapper} from "../../../packages/core/src/intent/intent-tool-mapper.js";
import type {CanonicalIntent,IntentAction} from "../../../packages/core/src/intent/types.js";

type Regression={input:string;expectedRouteSource:string;expectedOperation?:string;expectedTool?:string;expectedExecutable:boolean;expectedApproval:boolean;expectedScope?:string;expectedDeferredAction?:string;expectedContent?:string;expectedSafety?:string;expectedClarification?:boolean};
const rows=JSON.parse(fs.readFileSync(path.resolve("tests/evals/intents/filesystem-manual-regressions-v2.json"),"utf8")) as Regression[];
const downloads=path.join(os.tmpdir(),"NexoManualRouting","Downloads");
const registry=new ToolRegistry();

function canonical(row:Regression):CanonicalIntent|undefined{
  const operation=row.expectedOperation;
  if(!operation){
    if(row.input==="crie teste em downloads")return make("create_folder","create",{name:"teste",folder:"downloads"});
    return undefined;
  }
  if(operation==="create_folder"){
    const name=row.input.includes("Projeto Nexo")?"Projeto Nexo":row.input.includes("Experimentos")?"Experimentos":"teste";
    return make(operation,"create",{name,folder:"downloads"});
  }
  if(operation==="create_text_file"){
    const file=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1]??"teste.txt";
    return make(operation,"create",{name:file,folder:"downloads",...(row.expectedContent!==undefined?{content:row.expectedContent}:{})});
  }
  if(operation==="find_file"){
    const file=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1]??"teste.txt";
    return make(operation,"find",{name:file,...(row.expectedScope?{folder:row.expectedScope}:{})});
  }
  if(operation==="list_files")return make(operation,"list",{folder:"downloads"});
  if(operation==="write_text_file"){
    const file=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1]??"teste.txt";
    return make(operation,"update",{file,content:row.expectedContent??""});
  }
  return undefined;
}
function make(operation:string,intent:IntentAction,entities:Record<string,string>):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent,operation,entities:Object.fromEntries(Object.entries(entities).map(([key,value])=>[key,{value,source:"user" as const,confidence:.99}])),referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"manual-regression"}};
}

describe("manual Routing V2 regressions",()=>{
  for(const row of rows){
    it(row.input,async()=>{
      let parserCalls=0;
      const resolver=new HybridIntentResolver({parse:async()=>{parserCalls++;return canonical(row);}});
      const service=new CommandService(registry,()=>[downloads],{
        resolver,mapper:new IntentToolMapper(registry,()=>[downloads]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true,routingV2Enabled:()=>true,diagnosticsEnabled:()=>true
      });
      const route=await service.resolve(row.input);
      const diagnostics=service.hybridDiagnostics() as any;
      expect(diagnostics?.finalRoute?.source).toBe(row.expectedRouteSource);
      if(row.expectedTool)expect(route).toMatchObject({type:"tool",tool:row.expectedTool});
      if(row.expectedDeferredAction)expect(route).toMatchObject({type:"tool",deferredAction:{kind:row.expectedDeferredAction}});
      if(row.expectedContent!==undefined&&route.type==="tool"){
        const actual=route.deferredAction?.kind==="filesystem.write_text"?route.deferredAction.content:route.input.content;
        expect(actual).toBe(row.expectedContent);
      }
      if(row.expectedScope==="downloads"&&route.type==="tool"){
        const actual=String(route.input.root??route.input.path??"");
        expect(actual.toLowerCase()).toContain("downloads");
      }
      if(row.expectedClarification)expect(route.type==="chat"||route.type==="clarification"||route.type==="unknown").toBe(true);
      if(row.expectedRouteSource==="exact"||row.expectedRouteSource==="safety")expect(parserCalls).toBe(0);
      if(row.expectedRouteSource==="hybrid")expect(parserCalls).toBe(1);
    });
  }
});
