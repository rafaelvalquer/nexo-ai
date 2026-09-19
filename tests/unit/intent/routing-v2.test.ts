import {describe,expect,it} from "vitest";
import os from "node:os";
import path from "node:path";
import {CommandService} from "../../../packages/core/src/application/command-service.js";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";
import {HybridIntentResolver} from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import {IntentToolMapper} from "../../../packages/core/src/intent/intent-tool-mapper.js";
import type {CanonicalIntent,IntentAction} from "../../../packages/core/src/intent/types.js";

const root=path.join(os.tmpdir(),"NexoRoutingV2","Downloads");
const registry=new ToolRegistry();

function canonical(operation:string,intent:IntentAction,entities:Record<string,string>,ambiguities:CanonicalIntent["ambiguities"]=[]):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent,operation,entities:Object.fromEntries(Object.entries(entities).map(([key,value])=>[key,{value,source:"user" as const,confidence:.99}])),referencesPreviousResult:false,ambiguities,missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
}
function service(parse:(text:string)=>CanonicalIntent|undefined,onCall?:()=>void){
  const resolver=new HybridIntentResolver({parse:async input=>{onCall?.();return parse(input.text);}});
  return new CommandService(registry,()=>[root],{resolver,mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true,routingV2Enabled:()=>true});
}

describe("CommandService.resolve Routing V2",()=>{
  it.each([
    "faz uma pastinha chamada teste nos meus downloads",
    "será que dá pra fazer uma pastinha chamada teste lá nos meus downloads?"
  ])("envia linguagem natural para Hybrid antes do legacy list_files: %s",async input=>{
    const route=await service(()=>canonical("create_folder","create",{name:"teste",folder:"downloads"})).resolve(input);
    expect(route).toMatchObject({type:"tool",tool:"create_folder",input:{path:path.join(root,"teste")}});
  });

  it.each([
    "alterar o conteudo do arquivo teste123.txt para teste modificação",
    "troque o conteúdo do teste123.txt por abc 123",
    "edite teste123.txt e coloque Cliente XPTO"
  ])("não encerra alteração como find_file sem deferred action: %s",async input=>{
    const content=input.includes("abc 123")?"abc 123":input.includes("Cliente")?"Cliente XPTO":"teste modificação";
    const route=await service(()=>canonical("write_text_file","update",{file:"teste123.txt",content})).resolve(input);
    expect(route).toMatchObject({type:"tool",tool:"find_file",deferredAction:{kind:"filesystem.write_text",fileName:"teste123.txt",content}});
  });

  it("fast path exato continua sem chamar a LLM",async()=>{
    let calls=0;
    const route=await service(()=>undefined,()=>calls++).resolve("liste downloads");
    expect(route).toMatchObject({type:"tool",tool:"list_files"});
    expect(calls).toBe(0);
  });

  it("negação, informacional e traversal terminam antes do Hybrid",async()=>{
    let calls=0;const s=service(()=>canonical("create_folder","create",{name:"teste",folder:"downloads"}),()=>calls++);
    await expect(s.resolve("não crie uma pasta chamada teste nos downloads")).resolves.toMatchObject({type:"chat",response:"Nenhuma ação foi executada."});
    await expect(s.resolve("como criar uma pasta no Windows?")).resolves.toMatchObject({type:"chat",stream:true});
    await expect(s.resolve("crie uma pasta ../teste em downloads")).resolves.toMatchObject({type:"chat",response:expect.stringContaining("navegação relativa")});
    expect(calls).toBe(0);
  });

  it("escopo explícito não resolvido não vira busca global",async()=>{
    const route=await service(()=>canonical("find_file","find",{name:"teste123.txt",folder:"documentos secretos"})).resolve("procure teste123.txt na minha pasta documentos secretos");
    expect(route).toMatchObject({type:"chat",response:expect.stringContaining("documentos secretos")});
  });

  it("ambiguidade arquivo versus pasta vira clarification",async()=>{
    const route=await service(()=>canonical("create_folder","create",{name:"teste",folder:"downloads"})).resolve("crie teste em downloads");
    expect(route).toMatchObject({type:"chat",response:expect.stringContaining("pasta ou um arquivo")});
  });
});
