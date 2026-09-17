import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {_electron as electron,expect,test} from "@playwright/test";
import mammoth from "mammoth";

test("Agent V2 full executes a stateful single-tool sequence and creates exactly one approved file",async()=>{
  test.setTimeout(120_000);
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-v2-electron-db-"));
  const files=fs.mkdtempSync(path.join(process.cwd(),".nexo-agent-v2-e2e-"));
  const target=path.join(files,"teste.txt");
  const calls:Array<{tools:string[];toolResults:number}>=[];
  const ollama=http.createServer((request,response)=>{
    response.setHeader("content-type","application/json");
    if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}
    if(request.url==="/api/embeddings"){response.end(JSON.stringify({embedding:[1,0,0]}));return;}
    if(request.url!=="/api/chat"){response.statusCode=404;response.end("{}");return;}
    let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{
      const payload=JSON.parse(body),tools=(payload.tools??[]).map((tool:any)=>tool.function.name),toolResults=(payload.messages??[]).filter((message:any)=>message.role==="tool").length;
      calls.push({tools,toolResults});
      const message=toolResults===0
        ? {content:"",tool_calls:[{id:"create-1",type:"function",function:{name:"create_text_file",arguments:{path:target,content:"Olá Nexo"}}}]}
        : {content:"Arquivo criado e validado."};
      response.end(JSON.stringify({message,done:true}));
    });
  });
  await new Promise<void>(resolve=>ollama.listen(0,"127.0.0.1",resolve));const address=ollama.address();if(!address||typeof address==="string")throw new Error("Mock Ollama indisponível.");
  const app=await electron.launch({executablePath:path.resolve("node_modules/electron/dist/electron.exe"),args:[path.resolve("apps/desktop")],env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:`http://127.0.0.1:${address.port}`,NEXO_MODEL:"qwen3:1.7b",NODE_ENV:"test"}});
  try{
    const page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible({timeout:15_000});
    await page.evaluate(root=>window.nexo.updateSettings({allowedRoots:[root],fileWritesEnabled:true,autonomy:"cautious",agentLoopMode:"full",agentLegacyFallbackEnabled:false}),files);
    const conversation=await page.evaluate(()=>window.nexo.createConversation("Agent V2 E2E"));
    const task=await page.evaluate(({conversationId,target})=>window.nexo.startChatTask(conversationId,`Crie ${target} com o conteúdo Olá Nexo`,[]),{conversationId:conversation.id,target});
    await expect.poll(async()=>page.evaluate(id=>window.nexo.getTask(id).then(task=>task?.status),task.id),{timeout:30_000}).toBe("waiting_approval");
    expect(fs.existsSync(target)).toBe(false);
    const approval=await page.evaluate(()=>window.nexo.listApprovals().then(rows=>rows.find((row:any)=>row.status==="pending")));
    expect(approval?.toolName).toBe("create_text_file");
    await page.evaluate(id=>window.nexo.resolveApproval(id,true),approval!.id);
    await expect.poll(async()=>page.evaluate(id=>window.nexo.getTask(id).then(task=>task?.status),task.id),{timeout:30_000}).toBe("completed");
    expect(fs.readFileSync(target,"utf8")).toBe("Olá Nexo");
    expect(fs.readdirSync(files).filter(name=>name==="teste.txt")).toHaveLength(1);
    expect(calls.filter(call=>call.tools.length)).toHaveLength(1);
    expect(calls[0].tools).toContain("create_text_file");
  }finally{
    await app.close();await new Promise<void>(resolve=>ollama.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});
    if(!path.resolve(files).startsWith(`${path.resolve(process.cwd())}${path.sep}.nexo-agent-v2-e2e-`))throw new Error("Unsafe test cleanup");fs.rmSync(files,{recursive:true,force:true});
  }
});

test("E2E-02 document resource is summarized before the approved markdown artifact is created",async()=>{
  const harness=await launchHarness((payload,index)=>{const id=resourceId(payload);if(index===0)return call("document_summarize",{documentIds:[id],instruction:"Resuma em tópicos"},"summary");if(index===1)return call("create_text_file",{path:path.join(harness.files,"resumo.md"),content:"Resumo integrado"},"create");return final("Resumo criado.");});
  try{const document=await importDocument(harness,"relatorio.md","Linha importante do relatório.");const task=await start(harness,"Resuma este documento e crie resumo.md",[document.id]);await waitApproval(harness,task.id);await approvePending(harness);await waitStatus(harness,task.id,"completed");expect(fs.readFileSync(path.join(harness.files,"resumo.md"),"utf8")).toBe("Resumo integrado");expect(harness.offered[0]).toContain("document_summarize");}
  finally{await harness.close();}
});

test("E2E-03 PDF resource is transformed into a non-empty reopenable DOCX",async()=>{
  const harness=await launchHarness((payload,index)=>index===0?call("document_transform",{sourceDocumentIds:[resourceId(payload)],instruction:"Reduza aos pontos principais",outputPath:path.join(harness.files,"resumo.docx"),format:"docx"},"transform"):final("DOCX criado."));
  try{const document=await importDocument(harness,"contrato.pdf",simplePdf("Contrato de teste com cláusulas principais."));const task=await start(harness,"Crie uma versão reduzida deste PDF em resumo.docx",[document.id]);await waitApproval(harness,task.id);await approvePending(harness);await waitStatus(harness,task.id,"completed");const target=path.join(harness.files,"resumo.docx");expect(fs.statSync(target).size).toBeGreaterThan(0);expect((await mammoth.extractRawText({path:target})).value.trim()).not.toBe("");}
  finally{await harness.close();}
});

test("E2E-04 candidate tools change from filesystem to document and back to file creation",async()=>{
  const harness=await launchHarness((payload,index)=>{const id=resourceId(payload),target=path.join(harness.files,"dynamic.md");if(index===0)return call("search_files",{path:harness.files,query:"contrato.pdf",maxDepth:1},"search");if(index===1)return call("document_summarize",{documentIds:[id],instruction:"Resuma"},"summary");if(index===2)return call("create_text_file",{path:target,content:"Resumo dinâmico"},"create");if(index===3)return call("file_info",{path:target},"validate");return final("Fluxo concluído.");});
  try{const document=await importDocument(harness,"contrato.md","Contrato anexado para seleção dinâmica.");fs.writeFileSync(path.join(harness.files,"contrato.pdf"),simplePdf("Contrato local"));const task=await start(harness,`Encontre contrato.pdf em ${harness.files}, resuma e salve dynamic.md`,[document.id]);await waitApproval(harness,task.id);await approvePending(harness);await waitStatus(harness,task.id,"completed");expect(harness.offered[0]).toContain("search_files");expect(harness.offered[1]).toContain("document_summarize");expect(harness.offered[2]).toContain("create_text_file");expect(fs.existsSync(path.join(harness.files,"dynamic.md"))).toBe(true);}
  finally{await harness.close();}
});

test("E2E-05 allowedRoots changed while waiting approval blocks dispatch",async()=>{
  const harness=await launchHarness((_payload,index)=>index===0?call("create_text_file",{path:path.join(harness.files,"stale.txt"),content:"never"},"stale"):final("done"));
  try{const target=path.join(harness.files,"stale.txt"),task=await start(harness,`Crie ${target}`,[]);await waitApproval(harness,task.id);const other=fs.mkdtempSync(path.join(process.cwd(),".nexo-agent-v2-other-"));try{await harness.page.evaluate(root=>window.nexo.updateSettings({allowedRoots:[root]}),other);await expect(harness.page.evaluate(()=>window.nexo.listApprovals().then(rows=>window.nexo.resolveApproval((rows.find((row:any)=>row.status==="pending") as any).id,true)))).rejects.toThrow(/PATH_DENIED|ACTION_STALE/);expect(fs.existsSync(target)).toBe(false);}finally{fs.rmSync(other,{recursive:true,force:true});}}
  finally{await harness.close();}
});

test("E2E-06 fileWritesEnabled changed while waiting approval blocks dispatch",async()=>{
  const harness=await launchHarness((_payload,index)=>index===0?call("create_text_file",{path:path.join(harness.files,"policy.txt"),content:"never"},"policy"):final("done"));
  try{const target=path.join(harness.files,"policy.txt"),task=await start(harness,`Crie ${target}`,[]);await waitApproval(harness,task.id);await harness.page.evaluate(()=>window.nexo.updateSettings({fileWritesEnabled:false}));await expect(harness.page.evaluate(()=>window.nexo.listApprovals().then(rows=>window.nexo.resolveApproval((rows.find((row:any)=>row.status==="pending") as any).id,true)))).rejects.toThrow(/TOOL_DISABLED|não está mais disponível/);expect(fs.existsSync(target)).toBe(false);}
  finally{await harness.close();}
});

test("E2E-07 crash at dispatch recovers without a second write",async()=>{
  test.setTimeout(120_000);const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-v2-crash-db-")),files=fs.mkdtempSync(path.join(process.cwd(),".nexo-agent-v2-crash-")),target=path.join(files,"crash.txt"),content="Nexo-safe-write\n".repeat(100_000);let turn=0;
  const server=http.createServer((request,response)=>{response.setHeader("content-type","application/json");if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}if(request.url!=="/api/chat"){response.statusCode=404;response.end("{}");return;}let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{const payload=JSON.parse(body);const message=turn++===0?call("create_text_file",{path:target,content},"crash-write"):final("Recuperado.");response.end(JSON.stringify({message,done:true}));});});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("Mock indisponível");
  const launch=()=>electron.launch({executablePath:path.resolve("node_modules/electron/dist/electron.exe"),args:[path.resolve("apps/desktop")],env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:`http://127.0.0.1:${address.port}`,NEXO_MODEL:"qwen3:1.7b",NEXO_TEST_CRASH_AFTER_FILESYSTEM_COMMIT:"1",NODE_ENV:"test"}});let app=await launch();
  try{let page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible({timeout:15_000});await page.evaluate(root=>window.nexo.updateSettings({allowedRoots:[root],fileWritesEnabled:true,autonomy:"cautious",agentLoopMode:"full",agentLegacyFallbackEnabled:false}),files);const conversation=await page.evaluate(()=>window.nexo.createConversation("crash")),task=await page.evaluate(({id,target})=>window.nexo.startChatTask(id,`Crie ${target}`,[]),{id:conversation.id,target});await expect.poll(()=>page.evaluate(id=>window.nexo.getTask(id).then(task=>task?.status),task.id),{timeout:30_000}).toBe("waiting_approval");const approval=await page.evaluate(()=>window.nexo.listApprovals().then(rows=>rows.find((row:any)=>row.status==="pending")));const crashed=app.process();const exited=new Promise<void>(resolve=>crashed.once("exit",()=>resolve()));void page.evaluate(id=>window.nexo.resolveApproval(id,true),approval!.id).catch(()=>undefined);await exited;
    app=await launch();page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible({timeout:15_000});await expect.poll(()=>page.evaluate(()=>window.nexo.status().then((status:any)=>status.agentDiagnostics.reconciliationStatus)),{timeout:30_000}).toBe("RECONCILED_SUCCESS");expect(fs.readFileSync(target,"utf8")).toBe(content);expect(fs.readdirSync(files).filter(name=>name==="crash.txt")).toHaveLength(1);
  }finally{await app.close().catch(()=>undefined);await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});if(!path.resolve(files).startsWith(`${path.resolve(process.cwd())}${path.sep}.nexo-agent-v2-crash-`))throw new Error("Unsafe cleanup");fs.rmSync(files,{recursive:true,force:true});}
});

type Decision=(payload:any,index:number)=>any;
type Harness={app:Awaited<ReturnType<typeof electron.launch>>;page:Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>["firstWindow"]>>;files:string;dataDir:string;offered:string[][];close():Promise<void>};
async function launchHarness(decide:Decision):Promise<Harness>{test.setTimeout(120_000);const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-v2-scenario-db-")),files=fs.mkdtempSync(path.join(process.cwd(),".nexo-agent-v2-scenario-")),offered:string[][]=[];let turns=0;const server=http.createServer((request,response)=>{response.setHeader("content-type","application/json");if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}if(request.url==="/api/embeddings"){response.end(JSON.stringify({embedding:[1,0,0]}));return;}if(request.url!=="/api/chat"){response.statusCode=404;response.end("{}");return;}let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{const payload=JSON.parse(body);if(!payload.tools?.length){const answer=JSON.stringify({message:{content:"Resumo validado do documento."},done:true});response.end(payload.stream?`${answer}\n`:answer);return;}offered.push(payload.tools.map((tool:any)=>tool.function.name));const message=decide(payload,turns++);response.end(JSON.stringify({message,done:true}));});});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("Mock indisponível");const app=await electron.launch({executablePath:path.resolve("node_modules/electron/dist/electron.exe"),args:[path.resolve("apps/desktop")],env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:`http://127.0.0.1:${address.port}`,NEXO_MODEL:"qwen3:1.7b",NODE_ENV:"test"}}),page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible({timeout:15_000});await page.evaluate(root=>window.nexo.updateSettings({allowedRoots:[root],fileWritesEnabled:true,autonomy:"cautious",agentLoopMode:"full",agentLegacyFallbackEnabled:false}),files);return{app,page,files,dataDir,offered,async close(){await app.close();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});if(!path.resolve(files).startsWith(`${path.resolve(process.cwd())}${path.sep}.nexo-agent-v2-scenario-`))throw new Error("Unsafe cleanup");fs.rmSync(files,{recursive:true,force:true});}};}
function call(name:string,args:Record<string,unknown>,id:string){return{content:"",tool_calls:[{id,type:"function",function:{name,arguments:args}}]};}function final(content:string){return{content};}
function resourceId(payload:any){const text=(payload.messages??[]).map((message:any)=>message.content??"").join("\n");const match=text.match(/ID: ([a-f0-9-]{20,})/i);if(!match)throw new Error("Resource ID ausente no prompt do Agent V2");return match[1];}
async function start(harness:Harness,text:string,documents:string[]){const conversation=await harness.page.evaluate(()=>window.nexo.createConversation("scenario"));return harness.page.evaluate(({id,text,documents})=>window.nexo.startChatTask(id,text,documents),{id:conversation.id,text,documents});}
async function waitStatus(harness:Harness,id:string,status:string){await expect.poll(()=>harness.page.evaluate(id=>window.nexo.getTask(id).then(task=>task?.status),id),{timeout:45_000}).toBe(status);}async function waitApproval(harness:Harness,id:string){await expect.poll(()=>harness.page.evaluate(id=>window.nexo.getTask(id).then(task=>task?.status),id),{timeout:45_000}).toMatch(/waiting_approval|completed|failed/);const task=await harness.page.evaluate(id=>window.nexo.getTask(id),id);if(task?.status!=="waiting_approval"){const approvals=await harness.page.evaluate(()=>window.nexo.listApprovals());throw new Error(JSON.stringify({task,offered:harness.offered,approvals},null,2));}}async function approvePending(harness:Harness){const approval=await harness.page.evaluate(()=>window.nexo.listApprovals().then(rows=>rows.find((row:any)=>row.status==="pending")));if(!approval)throw new Error("Aprovação pendente não encontrada");await harness.page.evaluate(id=>window.nexo.resolveApproval(id,true),approval.id);}
async function importDocument(harness:Harness,name:string,content:string|Buffer){const source=path.join(harness.files,name);fs.writeFileSync(source,content);await harness.app.evaluate(async({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source],bookmarks:[]});},source);const task=await harness.page.evaluate(()=>window.nexo.chooseDocument());if(!task)throw new Error("Importação não iniciada");await waitStatus(harness,task.id,"completed");const completed=await harness.page.evaluate(id=>window.nexo.getTask(id),task.id);return completed!.result as any;}
function simplePdf(text:string){const escaped=text.replace(/[()\\]/g,value=>`\\${value}`),objects=["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n","2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n","3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n","4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",`5 0 obj\n<< /Length ${escaped.length+34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\nendstream\nendobj\n`];let pdf="%PDF-1.4\n",offsets=[0];for(const object of objects){offsets.push(Buffer.byteLength(pdf));pdf+=object;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf,"binary");}
