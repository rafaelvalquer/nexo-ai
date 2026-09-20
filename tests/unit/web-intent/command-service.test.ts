import {describe,expect,it} from "vitest";
import {CommandService} from "../../../packages/core/src/application/command-service.js";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";
import {WebIntentMapper,WebIntentResolver} from "../../../packages/core/src/intent/web/index.js";
function service(registry=new ToolRegistry()){const resolver=new WebIntentResolver();return new CommandService(registry,()=>[],undefined,{resolver,mapper:new WebIntentMapper(registry),enabled:()=>true,shadowMode:()=>false,researchEnabled:()=>true});}
describe("CommandService web intent integration",()=>{
  it("upgrades InfoMoney search into web_research",async()=>expect(await service().resolve("pesquisar as principais noticias no infomoney")).toMatchObject({type:"tool",tool:"web_research",input:{sourceName:"infomoney"}}));
  it("does not open a browser for composed research",async()=>expect(await service().resolve("acesse o site infomoney e traga as principais notícias")).toMatchObject({type:"tool",tool:"web_research"}));
  it("preserves simple navigation",async()=>expect(await service().resolve("Abra https://www.infomoney.com.br/")).toMatchObject({type:"tool",tool:"browser_open"}));
  it("preserves interaction in Browser Agent",async()=>{const registry=new ToolRegistry({browserAgent:{startOrSteer:async()=>({command:"started"})} as any});expect(await service(registry).resolve("entre no InfoMoney e clique em Mercados")).toMatchObject({type:"tool",tool:"browser_agent_run"});});
});
