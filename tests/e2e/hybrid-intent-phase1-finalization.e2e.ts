import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

type StructuredReply={
  schemaVersion:1;domain:string;intent:string;operation:string;
  entities:Record<string,unknown>;referencesPreviousResult:boolean;
  ambiguities:unknown[];missing:string[];modelConfidence:number;
};

async function startOllama(resolve:(prompt:string)=>StructuredReply|undefined){
  let structuredCalls=0,chatCalls=0;
  const server=http.createServer((request,response)=>{
    response.setHeader("content-type","application/json");
    if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}
    if(request.url==="/api/embeddings"){response.end(JSON.stringify({embedding:[1,0,0]}));return;}
    if(request.url!=="/api/chat"){response.statusCode=404;response.end("{}");return;}
    let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{
      const payload=JSON.parse(body);
      const prompt=String(payload.messages?.at(-1)?.content??"");
      if(payload.format){
        structuredCalls++;
        const result=resolve(prompt)??{schemaVersion:1,domain:"unknown",intent:"unknown",operation:"unknown",entities:{},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.99};
        response.end(JSON.stringify({message:{content:JSON.stringify(result)},done:true}));return;
      }
      chatCalls++;
      response.end(JSON.stringify({message:{content:"Para criar uma pasta no Windows, use o Explorador de Arquivos."},done:true}));
    });
  });
  await new Promise<void>(resolveListen=>server.listen(0,"127.0.0.1",resolveListen));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Mock Ollama indisponível.");
  return{server,url:`http://127.0.0.1:${address.port}`,stats:()=>({structuredCalls,chatCalls})};
}

async function launchApp(prefix:string,ollamaUrl:string,root:string,downloads:string){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),`${prefix}-db-`));
  const app=await electron.launch({
    executablePath:path.resolve("node_modules/electron/dist/electron.exe"),
    args:[path.resolve("apps/desktop")],
    env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:ollamaUrl,NEXO_MODEL:"qwen3:1.7b",NEXO_SYSTEM_HOME:root,NEXO_SYSTEM_DOWNLOADS:downloads,NODE_ENV:"test"}
  });
  const page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible();
  await page.evaluate(rootPath=>window.nexo.updateSettings({
    allowedRoots:[rootPath],fileWritesEnabled:true,autonomy:"balanced",agentLoopMode:"full",agentLegacyFallbackEnabled:false,
    hybridIntentResolverEnabled:true,hybridIntentShadowMode:false,hybridIntentFilesystemEnabled:true,hybridIntentRoutingV2Enabled:true
  }),downloads);
  return{app,page,dataDir};
}

async function runPrompt(page:any,title:string,prompt:string){
  const conversation=await page.evaluate((value:string)=>window.nexo.createConversation(value),title);
  const task=await page.evaluate(({id,text}:{id:string;text:string})=>window.nexo.startChatTask(id,text,[]),{id:conversation.id,text:prompt});
  return task;
}

test("Routing V2 handles polite/indirect folder phrase through Hybrid, not list_files",async()=>{
  test.setTimeout(120_000);
  const root=fs.mkdtempSync(path.join(process.cwd(),".nexo-routing-v2-polite-")),downloads=path.join(root,"Downloads");fs.mkdirSync(downloads,{recursive:true});
  const ollama=await startOllama(()=>({schemaVersion:1,domain:"filesystem",intent:"create",operation:"create_folder",entities:{name:"Experimentos",folder:"downloads"},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.99}));
  const {app,page,dataDir}=await launchApp("nexo-routing-v2-polite",ollama.url,root,downloads);
  try{
    const task=await runPrompt(page,"Polite folder","será que dá pra fazer uma pastinha chamada Experimentos lá nos meus downloads?");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),task.id),{timeout:30_000}).toBe("waiting_approval");
    const approval=await page.evaluate(()=>window.nexo.listApprovals().then(rows=>rows.find((row:any)=>row.status==="pending")));
    expect(approval?.toolName).toBe("create_folder");
    expect(approval?.input?.path).toBe(path.join(downloads,"Experimentos"));
    expect(fs.existsSync(path.join(downloads,"Experimentos"))).toBe(false);
    expect(ollama.stats().structuredCalls).toBe(1);
  }finally{await app.close();await new Promise<void>(resolve=>ollama.server.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
});

test("Routing V2 safety guard and unresolved scope execute zero filesystem mutations",async()=>{
  test.setTimeout(150_000);
  const root=fs.mkdtempSync(path.join(process.cwd(),".nexo-routing-v2-safety-")),downloads=path.join(root,"Downloads");fs.mkdirSync(downloads,{recursive:true});fs.writeFileSync(path.join(downloads,"teste123.txt"),"original","utf8");
  const ollama=await startOllama(prompt=>prompt.includes("documentos secretos")
    ?{schemaVersion:1,domain:"filesystem",intent:"find",operation:"find_file",entities:{name:"teste123.txt",folder:"documentos secretos"},referencesPreviousResult:false,ambiguities:[],missing:[],modelConfidence:.99}
    :undefined);
  const {app,page,dataDir}=await launchApp("nexo-routing-v2-safety",ollama.url,root,downloads);
  try{
    const negated=await runPrompt(page,"Negated","não crie uma pasta chamada teste nos downloads");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),negated.id),{timeout:30_000}).toBe("completed");
    expect(fs.existsSync(path.join(downloads,"teste"))).toBe(false);
    expect((await page.evaluate(()=>window.nexo.listApprovals())).filter((row:any)=>row.status==="pending")).toHaveLength(0);

    const traversal=await runPrompt(page,"Traversal","crie uma pasta ../teste em downloads");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),traversal.id),{timeout:30_000}).toBe("completed");
    const traversalResult=await page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.result),traversal.id);
    expect(JSON.stringify(traversalResult)).toContain("navegação relativa");

    const scoped=await runPrompt(page,"Scope","procure teste123.txt na minha pasta documentos secretos");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),scoped.id),{timeout:30_000}).toBe("completed");
    const scopedResult=await page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.result),scoped.id);
    expect(JSON.stringify(scopedResult)).toContain("documentos secretos");

    const informational=await runPrompt(page,"Info","como criar uma pasta no Windows?");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),informational.id),{timeout:30_000}).toBe("completed");
    expect(ollama.stats().chatCalls).toBe(1);
    expect(fs.readFileSync(path.join(downloads,"teste123.txt"),"utf8")).toBe("original");
  }finally{await app.close();await new Promise<void>(resolve=>ollama.server.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
});

test("filesystem search remains available with Documents disabled",async()=>{
  test.setTimeout(120_000);
  const root=fs.mkdtempSync(path.join(process.cwd(),".nexo-routing-v2-docs-off-")),downloads=path.join(root,"Downloads");fs.mkdirSync(downloads,{recursive:true});fs.writeFileSync(path.join(downloads,"teste123.txt"),"ok","utf8");
  const ollama=await startOllama(()=>undefined);
  const {app,page,dataDir}=await launchApp("nexo-routing-v2-docs-off",ollama.url,root,downloads);
  try{
    await page.evaluate(()=>window.nexo.updateSettings({documentsEnabled:false}));
    const task=await runPrompt(page,"Docs disabled","procure teste123.txt");
    await expect.poll(()=>page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.status),task.id),{timeout:30_000}).toBe("completed");
    const result=await page.evaluate((id:string)=>window.nexo.getTask(id).then(item=>item?.result),task.id);
    expect(JSON.stringify(result)).toContain("teste123.txt");
    expect(ollama.stats().structuredCalls).toBe(0);
  }finally{await app.close();await new Promise<void>(resolve=>ollama.server.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
});
