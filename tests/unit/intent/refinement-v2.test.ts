import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {describe,expect,it,vi} from "vitest";
import {normalizeIntentInputV3} from "../../../packages/core/src/intent/input/input-normalizer-v3.js";
import {DomainEvidenceBuilder} from "../../../packages/core/src/intent/domain/domain-evidence-builder.js";
import {HardVetoMatrix} from "../../../packages/core/src/agent/decision/hard-veto-matrix.js";
import {GlobalDecisionArbiter} from "../../../packages/core/src/agent/decision/global-decision-arbiter.js";
import {CommandService} from "../../../packages/core/src/application/command-service.js";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";
import {HybridIntentResolver} from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import {IntentToolMapper} from "../../../packages/core/src/intent/intent-tool-mapper.js";
import {WebIntentMapper} from "../../../packages/core/src/intent/web/mapper.js";
import type {CanonicalIntent} from "../../../packages/core/src/intent/types.js";

const dataset=JSON.parse(fs.readFileSync(path.resolve("tests/evals/intents/refinement-v2-1000.json"),"utf8")) as Array<{prompt:string;expectedDomain:string;mustNotDomain?:string}>;
const builder=new DomainEvidenceBuilder();

function fsIntent():CanonicalIntent{
 return{schemaVersion:1,domain:"filesystem",intent:"update",operation:"write_text_file",entities:{file:{value:"teste123.txt",source:"user",confidence:.99},folder:{value:"downloads",source:"user",confidence:.99},content:{value:"rafael alterei",source:"user",confidence:.99}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
}

describe("Nexo Refinamento Definitivo V2",()=>{
 it("mantém dataset permanente com mais de 1000 regressões",()=>expect(dataset.length).toBeGreaterThanOrEqual(1000));

 it("preserva literais e corrige somente tokens estruturais",()=>{
  const input=normalizeIntentInputV3("altere o arqquivo teste123.txt na pasta dowload para rafael alterei");
  expect(input.routingText).toContain("arquivo teste123.txt");
  expect(input.routingText).toContain("download");
  expect(input.literalSegments.find(item=>item.type==="filename")?.value).toBe("teste123.txt");
  expect(input.literalSegments.find(item=>item.type==="content")?.value).toBe("rafael alterei");
 });

 it("gera evidência filesystem forte e aplica hard veto contra web",()=>{
  const evidence=builder.build("altere o conteudo do arquivo teste123.txt na pasta download para rafael alterei");
  expect(evidence.strongFilesystem).toBe(true);
  expect(evidence.top?.domain).toBe("filesystem");
  const veto=new HardVetoMatrix().evaluate("altere o conteudo do arquivo teste123.txt na pasta download para rafael alterei",{source:"web",domain:"web",operation:"research",entities:{query:"teste123.txt"},missing:[],ambiguities:[],confidence:.99,proposedTool:"web_research",mutatesState:false,evidence:[]},evidence);
  expect(veto).toMatchObject({veto:true,reason:"FILESYSTEM_EVIDENCE_VETO_WEB"});
 });

 it("exige margem maior para mutation concorrente",()=>{
  const text="altere teste123.txt para abc",evidence=builder.build("altere o arquivo teste123.txt na pasta downloads para abc");
  const result=new GlobalDecisionArbiter().decide({userText:text,domainEvidence:evidence,expectedDomain:"filesystem",candidates:[
   {source:"filesystem",domain:"filesystem",operation:"write_text_file",entities:{file:"teste123.txt",content:"abc"},missing:[],ambiguities:[],confidence:.96,proposedTool:"write_text_file",mutatesState:true,evidence:["deterministic"]},
   {source:"hybrid",domain:"filesystem",operation:"create_text_file",entities:{name:"teste123.txt",content:"abc"},missing:[],ambiguities:[],confidence:.94,proposedTool:"create_text_file",mutatesState:true,evidence:["llm"]}
  ]});
  expect(result.clarificationNeeded).toBe(true);
  expect(result.clarificationReason).toBe("DECISION_MARGIN_BELOW_THRESHOLD");
 });

 it.each(dataset.filter(row=>row.mustNotDomain==="web").slice(0,120))("filesystem nunca fica atrás de web em $prompt",row=>{
  const evidence=builder.build(row.prompt);
  expect(evidence.items.find(item=>item.domain==="filesystem")?.score??0).toBeGreaterThan(evidence.items.find(item=>item.domain==="web")?.score??0);
 });

 it("erro obrigatório arquivo->web não chama WebIntentResolver",async()=>{
  const root=path.join(os.tmpdir(),"NexoRefinementV2","Downloads"),registry=new ToolRegistry();
  const hybrid=new HybridIntentResolver({parse:async()=>fsIntent()});
  const webResolve=vi.fn(async()=>({status:"unknown",reason:"should-not-run"}));
  const service=new CommandService(registry,()=>[root],{resolver:hybrid,mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true,routingV2Enabled:()=>true,diagnosticsEnabled:()=>true},{resolver:{resolve:webResolve} as any,mapper:new WebIntentMapper(registry),enabled:()=>true,shadowMode:()=>false,researchEnabled:()=>true});
  const route=await service.resolve("altere o conteudo do arquivo teste123.txt na pasta download para rafael alterei");
  expect(route).toMatchObject({type:"tool",tool:"find_file",deferredAction:{kind:"filesystem.write_text",fileName:"teste123.txt",content:"rafael alterei"}});
  expect(webResolve).not.toHaveBeenCalled();
  expect(service.hybridDiagnostics()).toMatchObject({webIntent:{invoked:false},finalRoute:{tool:"find_file"}});
 });
});
