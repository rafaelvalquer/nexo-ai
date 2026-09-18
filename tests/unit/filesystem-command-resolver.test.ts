import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { FilesystemCommandResolver, filesystemCommandTool } from "../../packages/core/src/filesystem/intent/filesystem-command-resolver.js";
import { LegacyIntentRouter } from "../../packages/core/src/router/legacy-intent-router.js";
import { V2FastPathRouter } from "../../packages/core/src/agent/loop/v2-fast-path.js";
import fs from "node:fs/promises";
import { afterEach } from "vitest";
import { ToolRegistry } from "../../packages/core/src/tools/registry.js";
import { PermissionEngine } from "../../packages/core/src/permissions/policy.js";
import { ActionExecutor } from "../../packages/core/src/agent/execution/action-executor.js";
import { CommandService } from "../../packages/core/src/application/command-service.js";
import { observeConversationActionContext } from "../../packages/core/src/agent/context/conversation-action-context.js";

const tempRoots:string[]=[];
afterEach(async()=>{for(const root of tempRoots.splice(0))await fs.rm(root,{recursive:true,force:true});});

describe("FilesystemCommandResolver",()=>{
  const resolver=new FilesystemCommandResolver();
  const root=path.join(os.tmpdir(),"Downloads");
  it.each([
    ["procure o arquivo Caderno_de_Testes_Nexo_AI","find_file","stem"],
    ["procure o arquivo Caderno_de_Testes_Nexo_AI.txt","find_file","full_name"],
    ["procure arquivo teste","find_file","stem"],
    ["procure teste em Downloads","find_file","stem"],
  ])("resolves %s deterministically",(text,kind,matchMode)=>expect(resolver.resolve(text,[root])).toMatchObject({kind,matchMode}));

  it.each([
    ["crie teste.txt em Downloads","", "Downloads"],
    ["crie o arquivo teste.txt na pasta Downloads","", "Downloads"],
    ["crie um arquivo chamado teste.txt em Downloads","", "Downloads"],
    ["crie teste123.txt em Downloads com o conteúdo teste123","teste123", "Downloads"],
    ["crie teste123.txt em Downloads contendo teste123","teste123", "Downloads"],
    ["crie teste123.txt em Downloads com o texto teste123","teste123", "Downloads"],
    ["crie teste123.txt em Downloads e escreva teste123","teste123", "Downloads"],
  ])("routes create commands ahead of list: %s",(text,content)=>{
    const command=resolver.resolve(text,[root]);
    expect(command).toMatchObject({kind:"create_text_file",fileName:expect.stringMatching(/teste(?:123)?\.txt/),destination:root,content});
    const mapped=filesystemCommandTool(command!);
    expect(mapped.tool).toBe("create_text_file");
    expect(mapped.tool).not.toBe("list_files");
  });

  it("routes list requests separately and uses one shared resolver in both routers",()=>{
    expect(resolver.resolve("liste os arquivos em Downloads",[root])).toMatchObject({kind:"list_files",folder:root});
    expect(resolver.resolve("liste Downloads",[root])).toMatchObject({kind:"list_files",folder:root});
    expect(resolver.resolve("Procure PDFs em Downloads",[root])).toMatchObject({kind:"search_files",query:".pdf",folder:root});
    expect(new LegacyIntentRouter().route("crie teste.txt na pasta downloads",{allowedRoots:[root]})).toMatchObject({tool:"create_text_file"});
    expect(new V2FastPathRouter().resolve("crie teste.txt na pasta downloads",[{name:"create_text_file"} as any],[root])).toMatchObject({name:"create_text_file"});
  });

  it("persists a clarification request when a previous search has multiple file matches",()=>{
    const files=[{name:"teste.txt",path:path.join(root,"teste.txt"),root},{name:"teste.pdf",path:path.join(root,"teste.pdf"),root}];
    expect(new CommandService(new ToolRegistry(),()=>[root]).route("analise esse arquivo",{updatedAt:new Date().toISOString(),lastDomain:"filesystem",lastTool:"find_file",files})).toMatchObject({type:"clarification",action:"analyze_file",intent:{missing:["fileMatch"],entities:{files}}});
  });

  it("does not route spreadsheet creation into the text writer",()=>{
    expect(resolver.resolve("crie teste.xlsx em Downloads",[root])).toBeUndefined();
    expect(resolver.unsupportedSpreadsheetCreation("crie teste.xlsx em Downloads")).toContain("Ainda não consigo criar planilhas");
    expect(new LegacyIntentRouter().route("crie teste.xlsx em Downloads",{allowedRoots:[root]})).toMatchObject({direct:expect.stringContaining("Ainda não consigo criar planilhas")});
  });

  it("routes a bare stem and creates empty/non-empty files through ActionExecutor",async()=>{
    const base=await fs.mkdtemp(path.join(os.tmpdir(),"nexo-filesystem-command-"));tempRoots.push(base);const authorized=path.join(base,"Downloads");await fs.mkdir(authorized);
    const settings:any={allowedRoots:[authorized],autonomy:"balanced",fileWritesEnabled:true,browserAutomationEnabled:true,connectionsEnabled:true,allowedDomains:[]};
    const permissions=new PermissionEngine(()=>settings);
    const registry=new ToolRegistry({filesystemRoots:()=>permissions.allowedRoots(),permissions});
    const executor=new ActionExecutor(registry,permissions,{record(){}} as any);
    const commands=new CommandService(registry,()=>permissions.allowedRoots());
    for(const name of ["teste.txt","teste.pdf","teste.xlsx","teste_backup.txt"])await fs.writeFile(path.join(authorized,name),"x");
    const find=commands.route("procure o arquivo teste");
    expect(find).toMatchObject({type:"tool",tool:"find_file",input:{name:"teste",matchMode:"stem"}});
    if(find.type!=="tool")throw new Error("Expected deterministic find_file route");
    const preparedFind=await executor.preflight(find.tool,find.input,{userRequest:"procure o arquivo teste"});
    if(!preparedFind.ok)throw new Error(preparedFind.message);
    const found=await executor.executePrepared(preparedFind.action);
    expect(found.status).toBe("SUCCEEDED");
    expect((found.result?.data as any).matches.map((item:any)=>item.name)).toEqual(["teste.pdf","teste.txt","teste.xlsx"]);
    const uniqueContext=observeConversationActionContext(undefined,"procure vazio.txt",undefined,{tool:"find_file",input:{name:"vazio.txt",matchMode:"full_name"}} as any,{ok:true,success:true,summary:"1 encontrado",data:{matches:[{name:"vazio.txt",path:path.join(authorized,"vazio.txt"),root:authorized}]}} as any);
    expect(uniqueContext.files).toEqual([{name:"vazio.txt",path:path.join(authorized,"vazio.txt"),root:authorized}]);
    expect(commands.route("abra esse arquivo",uniqueContext)).toMatchObject({type:"tool",tool:"open_path",input:{path:path.join(authorized,"vazio.txt")}});
    expect(commands.route("analise esse arquivo",uniqueContext)).toMatchObject({type:"tool",tool:"document_summarize",input:{path:path.join(authorized,"vazio.txt")} });

    const empty=commands.route("crie o arquivo vazio.txt na pasta Downloads");
    expect(empty).toMatchObject({type:"tool",tool:"create_text_file",input:{content:""}});
    expect(empty).toMatchObject({input:{path:path.join(authorized,"vazio.txt")}});
    if(empty.type!=="tool")throw new Error("Expected deterministic create_text_file route");
    const preparedEmpty=await executor.preflight(empty.tool,empty.input,{userRequest:"crie o arquivo vazio.txt na pasta Downloads"});
    if(!preparedEmpty.ok)throw new Error(preparedEmpty.message);
    expect((await executor.executePrepared(preparedEmpty.action)).status).toBe("SUCCEEDED");
    expect(await fs.readFile(path.join(authorized,"vazio.txt"),"utf8")).toBe("");

    const filled=commands.route("crie o arquivo teste123.txt na pasta Downloads com o conteudo teste123");
    expect(filled).toMatchObject({type:"tool",tool:"create_text_file",input:{content:"teste123"}});
    if(filled.type!=="tool")throw new Error("Expected deterministic create_text_file route");
    const preparedFilled=await executor.preflight(filled.tool,filled.input,{userRequest:"crie o arquivo teste123.txt na pasta Downloads com o conteudo teste123"});
    if(!preparedFilled.ok)throw new Error(preparedFilled.message);
    expect((await executor.executePrepared(preparedFilled.action)).status).toBe("SUCCEEDED");
    expect(await fs.readFile(path.join(authorized,"teste123.txt"),"utf8")).toBe("teste123");
  });
});

