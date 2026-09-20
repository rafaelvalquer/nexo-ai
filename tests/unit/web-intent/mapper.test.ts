import {describe,expect,it} from "vitest";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";
import {WebIntentMapper} from "../../../packages/core/src/intent/web/mapper.js";
import type {CanonicalWebIntent} from "../../../packages/core/src/intent/web/types.js";
function intent(operation:CanonicalWebIntent["operation"],entities:CanonicalWebIntent["entities"]={}):CanonicalWebIntent{return{schemaVersion:1,domain:"web",operation,entities,requiresInformation:operation==="research",requiresInteraction:operation==="interact",confidence:.99,ambiguities:[],missing:[]};}
describe("WebIntentMapper",()=>{
  it("maps research to web_research and never browser_open",()=>{const registry=new ToolRegistry();const mapped=new WebIntentMapper(registry).map(intent("research",{sourceName:"InfoMoney",query:"principais notícias"}),"x");expect(mapped).toMatchObject({type:"tool",tool:"web_research",input:{sourceName:"InfoMoney",query:"principais notícias"}});});
  it("maps explicit navigation to browser_open",()=>{const registry=new ToolRegistry();expect(new WebIntentMapper(registry).map(intent("navigate",{url:"https://example.com"}),"x")).toMatchObject({type:"tool",tool:"browser_open",input:{url:"https://example.com"}});});
  it("maps interaction to browser_agent_run when available",()=>{const registry=new ToolRegistry({browserAgent:{startOrSteer:async()=>({command:"started"})} as any});expect(new WebIntentMapper(registry).map(intent("interact",{requestedAction:"clique"}),"entre no site e clique")).toMatchObject({type:"tool",tool:"browser_agent_run"});});
});
