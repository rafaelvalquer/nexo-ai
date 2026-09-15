import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {_electron as electron,expect,test} from "@playwright/test";

test("Electron persists real file cards and approves an exact rename inline",async()=>{
  test.setTimeout(90000);
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-cards-electron-db-"));
  const files=fs.mkdtempSync(path.join(process.cwd(),".nexo-chat-test-"));
  fs.writeFileSync(path.join(files,"report.txt"),"Relatório de teste local.");
  const ollama=http.createServer((request,response)=>{
    response.setHeader("content-type","application/json");
    if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}
    if(request.url!=="/api/chat"){response.statusCode=404;response.end("{}");return;}
    let body="";request.on("data",chunk=>body+=chunk);request.on("end",()=>{
      const payload=JSON.parse(body),structured=payload.format&&typeof payload.format==="object";
      const content=structured?{schemaVersion:1,status:"ready",domain:"filesystem",intent:"list",operation:"list_files",entities:{path:files},referencesPreviousResult:false,requiresDataLookup:true,requiresConfirmation:false,confidence:.99}:{tool:"list_files",input:{path:files}};
      response.end(JSON.stringify({message:{content:JSON.stringify(content)},done:true}));
    });
  });
  await new Promise<void>(resolve=>ollama.listen(0,"127.0.0.1",resolve));const address=ollama.address();if(!address||typeof address==="string")throw new Error("Mock indisponível");
  const app=await electron.launch({executablePath:path.resolve("node_modules/electron/dist/electron.exe"),args:[path.resolve("apps/desktop")],env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:`http://127.0.0.1:${address.port}`,NEXO_MODEL:"qwen3:1.7b",NODE_ENV:"test"}});
  try{
    const page=await app.firstWindow();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await expect(page.locator("#root .app")).toBeVisible();await page.getByRole("button",{name:"Pular por enquanto"}).click();
    await page.evaluate(files=>window.nexo.updateSettings({allowedRoots:[files],fileWritesEnabled:true,agentLoopMode:"legacy"}),files);
    await page.getByRole("button",{name:"Assistente",exact:true}).click();
    await page.getByRole("textbox",{name:"Mensagem para o Nexo"}).fill(`Liste os arquivos da pasta "${files}"`);
    await page.getByRole("button",{name:"Enviar mensagem",exact:true}).click();
    const card=page.locator(".resourceCard").filter({hasText:"report.txt"});await expect(card).toBeVisible({timeout:20000});
    await card.getByRole("button",{name:"Visualizar",exact:true}).click();await expect(card.locator("pre")).toContainText("Relatório de teste local.");
    await card.getByRole("button",{name:"Renomear",exact:true}).click();await card.getByLabel("Novo nome").fill("reviewed.txt");
    await card.getByRole("button",{name:"Revisar alteração",exact:true}).click();
    await expect(page.getByRole("region",{name:"Confirmação da ação"})).toBeVisible();expect(fs.existsSync(path.join(files,"report.txt"))).toBe(true);
    await page.getByRole("button",{name:"Confirmar",exact:true}).click();
    await expect(page.locator(".resourceCard").filter({hasText:"reviewed.txt"})).toBeVisible();expect(fs.existsSync(path.join(files,"reviewed.txt"))).toBe(true);expect(fs.existsSync(path.join(files,"report.txt"))).toBe(false);
    await page.reload();await page.getByRole("button",{name:"Assistente",exact:true}).click();
    await expect(page.locator(".resourceCard").filter({hasText:"reviewed.txt"})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{
    await app.close();await new Promise<void>(resolve=>ollama.close(()=>resolve()));fs.rmSync(dataDir,{recursive:true,force:true});
    if(!path.resolve(files).startsWith(path.resolve(process.cwd())+path.sep+".nexo-chat-test-"))throw new Error("Unsafe test cleanup");fs.rmSync(files,{recursive:true,force:true});
  }
});
