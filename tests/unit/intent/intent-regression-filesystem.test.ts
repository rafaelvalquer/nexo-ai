import { describe,expect,it } from "vitest";
import path from "node:path";
import os from "node:os";
import { CommandService } from "../../../packages/core/src/application/command-service.js";
import { ToolRegistry } from "../../../packages/core/src/tools/registry.js";
import { HybridIntentResolver } from "../../../packages/core/src/intent/hybrid-intent-resolver.js";
import { IntentToolMapper } from "../../../packages/core/src/intent/intent-tool-mapper.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";

const root=path.join(os.tmpdir(),"Downloads");
const registry=new ToolRegistry();
const folderIntent:CanonicalIntent={schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:{value:"teste",source:"user",confidence:.99},folder:{value:"downloads",source:"semantic_alias",confidence:.99}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
const writeIntent:CanonicalIntent={schemaVersion:1,domain:"filesystem",intent:"update",operation:"write_text_file",entities:{file:{value:"teste123.txt",source:"user",confidence:.99},content:{value:"teste modificação",source:"user",confidence:.99}},referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};

describe("filesystem hybrid regression",()=>{
  it("não transforma destino não reconhecido em nome de pasta relativo",async()=>{
    const service=new CommandService(registry,()=>[root]);
    const routed=await service.resolve("crie a pasta teste dentro da pasta downloads");
    expect(routed).toMatchObject({type:"tool",tool:"create_folder",input:{path:path.join(root,"teste")}});
    if(routed.type==="tool")expect(String(routed.input.path)).not.toContain("teste dentro da pasta");
  });

  it("não confunde a pasta do destino com o recurso a criar",async()=>{
    const service=new CommandService(registry,()=>[root]);
    const routed=await service.resolve("crie a teste123 na pasta downloads");
    expect(routed).not.toMatchObject({type:"tool",tool:"create_folder",input:{path:root}});
  });

  it("mantém o fast path existente como prioridade",async()=>{
    const service=new CommandService(registry,()=>[root]);
    expect(await service.resolve("crie teste.txt em Downloads")).toMatchObject({type:"tool",tool:"create_text_file"});
    expect(await service.resolve("liste downloads")).toMatchObject({type:"tool",tool:"list_files"});
    expect(await service.resolve("procure teste.txt")).toMatchObject({type:"tool",tool:"find_file"});
  });

  it.each([
    "crie a pasta teste dentro da pasta downloads",
    "faz uma pasta chamada teste no download",
    "quero uma pasta teste dentro dos downloads",
    "cria uma pastinha chamada teste nos meus downloads"
  ])("usa fallback híbrido para: %s",async phrase=>{
    const service=new CommandService(registry,()=>[root],{resolver:new HybridIntentResolver({parse:async()=>folderIntent}),mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true});
    await expect(service.resolve(phrase)).resolves.toMatchObject({type:"tool",tool:"create_folder",input:{path:path.join(root,"teste")}});
  });

  it("pede esclarecimento quando só a pasta de destino possui tipo explícito",async()=>{
    const service=new CommandService(registry,()=>[root],{resolver:new HybridIntentResolver({parse:async()=>folderIntent}),mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true});
    await expect(service.resolve("crie a teste123 na pasta downloads")).resolves.toMatchObject({type:"chat",response:expect.stringContaining("pasta ou um arquivo")});
  });

  it("mantém perguntas e negações fora das Tools",async()=>{
    const service=new CommandService(registry,()=>[root],{resolver:new HybridIntentResolver({parse:async()=>folderIntent}),mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true});
    await expect(service.resolve("como criar uma pasta no Windows?")).resolves.toMatchObject({type:"chat",stream:true});
    await expect(service.resolve("não crie uma pasta teste em downloads")).resolves.toMatchObject({type:"chat",response:expect.stringContaining("Nenhuma ação")});
  });

  it("não chama o Hybrid para caminhos físicos explícitos já tratados pelo Agent V2",async()=>{
    let parserCalls=0;
    const service=new CommandService(registry,()=>[root],{
      resolver:new HybridIntentResolver({parse:async()=>{parserCalls++;return folderIntent;}}),
      mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true
    });
    await expect(service.resolve("Crie C:\\Projetos\\teste.txt com o conteúdo abc")).resolves.toMatchObject({type:"unknown"});
    expect(parserCalls).toBe(0);
  });

  it("converte alteração de conteúdo em busca segura antes da escrita",async()=>{
    const service=new CommandService(registry,()=>[root],{resolver:new HybridIntentResolver({parse:async()=>writeIntent}),mapper:new IntentToolMapper(registry,()=>[root]),enabled:()=>true,shadowMode:()=>false,filesystemEnabled:()=>true});
    await expect(service.resolve("alterar o conteudo do arquivo teste123.txt para teste modificação")).resolves.toMatchObject({type:"tool",tool:"find_file",deferredAction:{kind:"filesystem.write_text"}});
  });
});
