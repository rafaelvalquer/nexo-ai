import { describe,expect,it } from "vitest";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "../../../packages/core/src/tools/registry.js";
import { IntentToolMapper } from "../../../packages/core/src/intent/intent-tool-mapper.js";
import type { CanonicalIntent } from "../../../packages/core/src/intent/types.js";

function make(operation:string,action:"create"|"update",entities:Record<string,string>):CanonicalIntent{
  return{schemaVersion:1,domain:"filesystem",intent:action,operation,entities:Object.fromEntries(Object.entries(entities).map(([key,value])=>[key,{value,source:"user" as const,confidence:.99}])),referencesPreviousResult:false,ambiguities:[],missing:[],source:"llm",diagnostics:{rawModelConfidence:.99,resolverVersion:"test"}};
}

describe("IntentToolMapper",()=>{
  const root=path.join(os.tmpdir(),"nexo-hybrid","Downloads");
  const mapper=new IntentToolMapper(new ToolRegistry(),()=>[root]);

  it("resolve alias lógico no Core e não recebe path físico da LLM",()=>{
    const mapped=mapper.map(make("create_folder","create",{name:"teste",folder:"downloads"}));
    expect(mapped).toMatchObject({type:"tool",tool:"create_folder",input:{path:path.join(root,"teste")}});
  });

  it("mapeia edição por nome para find_file + deferred write",()=>{
    const mapped=mapper.map(make("write_text_file","update",{file:"teste123.txt",content:"teste modificação"}));
    expect(mapped).toMatchObject({type:"tool",tool:"find_file",input:{name:"teste123.txt",matchMode:"full_name"},deferredAction:{kind:"filesystem.write_text",fileName:"teste123.txt",content:"teste modificação"}});
  });
});
