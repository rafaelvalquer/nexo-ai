import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Agent V2 resolves Downloads and creates an empty text file deterministically", async () => {
  test.setTimeout(120_000);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-v2-location-db-"));
  const root = fs.mkdtempSync(path.join(process.cwd(), ".nexo-agent-v2-location-"));
  const downloads = path.join(root, "Downloads");
  const expected = path.join(downloads, "NexoTeste", "teste.txt");
  const wrong = path.join(root, "model-choice", "teste.txt");
  let toolTurn = 0;
  let chatCalls = 0;

  const ollama = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") { response.end(JSON.stringify({ models: [{ name: "qwen3:1.7b" }] })); return; }
    if (request.url === "/api/embeddings") { response.end(JSON.stringify({ embedding: [1, 0, 0] })); return; }
    if (request.url !== "/api/chat") { response.statusCode = 404; response.end("{}"); return; }
    chatCalls++;
    let body = "";
    request.on("data", chunk => body += chunk);
    request.on("end", () => {
      const payload = JSON.parse(body);
      const tools = payload.tools ?? [];
      const message = tools.length && toolTurn++ === 0
        ? { content: "", tool_calls: [{ id: "create-location", type: "function", function: { name: "create_text_file", arguments: { path: wrong, content: "Olá Nexo" } } }] }
        : { content: "Arquivo criado no destino solicitado." };
      response.end(JSON.stringify({ message, done: true }));
    });
  });
  await new Promise<void>(resolve => ollama.listen(0, "127.0.0.1", resolve));
  const address = ollama.address();
  if (!address || typeof address === "string") throw new Error("Mock Ollama indisponível.");

  const app = await electron.launch({
    executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [path.resolve("apps/desktop")],
    env: {
      ...process.env,
      NEXO_DATA_DIR: dataDir,
      NEXO_CORE_PORT: "0",
      NEXO_OLLAMA_URL: `http://127.0.0.1:${address.port}`,
      NEXO_MODEL: "qwen3:1.7b",
      NEXO_SYSTEM_HOME: root,
      NEXO_SYSTEM_DOWNLOADS: downloads,
      NODE_ENV: "test",
    },
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#root .app")).toBeVisible();
    await page.evaluate(rootPath => window.nexo.updateSettings({ allowedRoots: [rootPath], fileWritesEnabled: true, autonomy: "cautious", agentLoopMode: "full", agentLegacyFallbackEnabled: false }), root);
    const conversation = await page.evaluate(() => window.nexo.createConversation("Location filesystem E2E"));
    const task = await page.evaluate(id => window.nexo.startChatTask(id, "Crie teste.txt em Downloads\\NexoTeste", []), conversation.id);

    await expect.poll(async () => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 30_000 }).toBe("waiting_approval");
    const approval = await page.evaluate(() => window.nexo.listApprovals().then(rows => rows.find((row: any) => row.status === "pending")));
    expect(approval?.toolName).toBe("create_text_file");
    expect(approval?.input?.path).toBe(expected);
    expect(fs.existsSync(expected)).toBe(false);

    await page.evaluate(id => window.nexo.resolveApproval(id, true), approval!.id);
    await expect.poll(async () => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 30_000 }).toBe("completed");

    expect(fs.readFileSync(expected, "utf8")).toBe("");
    expect(chatCalls).toBe(0);
    expect(fs.existsSync(wrong)).toBe(false);
  } finally {
    await app.close();
    await new Promise<void>(resolve => ollama.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (!path.resolve(root).startsWith(`${path.resolve(process.cwd())}${path.sep}.nexo-agent-v2-location-`)) throw new Error("Unsafe test cleanup");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Agent V2 resolves a misspelled download alias and creates an empty file without the LLM", async () => {
  test.setTimeout(120_000);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-v2-location-typo-db-"));
  const root = fs.mkdtempSync(path.join(process.cwd(), ".nexo-agent-v2-location-"));
  const downloads = path.join(root, "Downloads");
  const expected = path.join(downloads, "typo.txt");
  let chatCalls = 0;

  const ollama = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") { response.end(JSON.stringify({ models: [{ name: "qwen3:1.7b" }] })); return; }
    if (request.url !== "/api/chat") { response.statusCode = 404; response.end("{}"); return; }
    chatCalls++;
    let body = "";
    request.on("data", chunk => body += chunk);
    request.on("end", () => {
      const payload = JSON.parse(body);
      const hasToolResult = (payload.messages ?? []).some((message: any) => message.role === "tool");
      const message = payload.tools?.length && !hasToolResult
        ? { content: "", tool_calls: [{ id: "create-typo", type: "function", function: { name: "create_text_file", arguments: { path: path.join(root, "wrong-typo.txt"), content: "fuzzy" } } }] }
        : { content: "Arquivo criado." };
      response.end(JSON.stringify({ message, done: true }));
    });
  });
  await new Promise<void>(resolve => ollama.listen(0, "127.0.0.1", resolve));
  const address = ollama.address();
  if (!address || typeof address === "string") throw new Error("Mock Ollama indisponível.");
  const app = await electron.launch({ executablePath: path.resolve("node_modules/electron/dist/electron.exe"), args: [path.resolve("apps/desktop")], env: { ...process.env, NEXO_DATA_DIR: dataDir, NEXO_CORE_PORT: "0", NEXO_OLLAMA_URL: `http://127.0.0.1:${address.port}`, NEXO_MODEL: "qwen3:1.7b", NEXO_SYSTEM_HOME: root, NEXO_SYSTEM_DOWNLOADS: downloads, NODE_ENV: "test" } });

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#root .app")).toBeVisible();
    await page.evaluate(rootPath => window.nexo.updateSettings({ allowedRoots: [rootPath], fileWritesEnabled: true, autonomy: "cautious", agentLoopMode: "full", agentLegacyFallbackEnabled: false }), root);
    const conversation = await page.evaluate(() => window.nexo.createConversation("Location typo E2E"));
    const task = await page.evaluate(id => window.nexo.startChatTask(id, "Crie typo.txt em downlaod", []), conversation.id);
    await expect.poll(async () => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 30_000 }).toBe("waiting_approval");
    const approval = await page.evaluate(() => window.nexo.listApprovals().then(rows => rows.find((row: any) => row.status === "pending")));
    expect(approval?.input?.path).toBe(expected);
    await page.evaluate(id => window.nexo.resolveApproval(id, true), approval!.id);
    await expect.poll(async () => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 30_000 }).toBe("completed");
    expect(fs.readFileSync(expected, "utf8")).toBe("");
    expect(chatCalls).toBe(0);
  } finally {
    await app.close();
    await new Promise<void>(resolve => ollama.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (!path.resolve(root).startsWith(`${path.resolve(process.cwd())}${path.sep}.nexo-agent-v2-location-`)) throw new Error("Unsafe test cleanup");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Agent V2 finds an extensionless filename across all authorized roots without the LLM", async () => {
  test.setTimeout(120_000);
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-v2-file-stem-db-"));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-v2-file-stem-roots-"));
  const downloads=path.join(root,"Downloads"),documents=path.join(root,"Documents"),desktop=path.join(root,"Desktop");
  for(const directory of [downloads,documents,desktop])fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(downloads,"Caderno_de_Testes_Nexo_AI.txt"),"TXT");
  fs.writeFileSync(path.join(documents,"Caderno_de_Testes_Nexo_AI.pdf"),"PDF");
  fs.writeFileSync(path.join(desktop,"Caderno_de_Testes_Nexo_AI.xlsx"),"XLSX");
  fs.writeFileSync(path.join(downloads,"Caderno_de_Testes_Nexo_AI_backup.txt"),"backup");
  let chatCalls=0;
  const ollama=http.createServer((request,response)=>{
    response.setHeader("content-type","application/json");
    if(request.url==="/api/tags"){response.end(JSON.stringify({models:[{name:"qwen3:1.7b"}]}));return;}
    if(request.url==="/api/chat"){chatCalls++;response.end(JSON.stringify({message:{content:"Não deveria ser necessário chamar o modelo."},done:true}));return;}
    response.statusCode=404;response.end("{}");
  });
  await new Promise<void>(resolve=>ollama.listen(0,"127.0.0.1",resolve));
  const address=ollama.address();if(!address||typeof address==="string")throw new Error("Mock Ollama indisponível.");
  const app=await electron.launch({executablePath:path.resolve("node_modules/electron/dist/electron.exe"),args:[path.resolve("apps/desktop")],env:{...process.env,NEXO_DATA_DIR:dataDir,NEXO_CORE_PORT:"0",NEXO_OLLAMA_URL:`http://127.0.0.1:${address.port}`,NEXO_MODEL:"qwen3:1.7b",NEXO_SYSTEM_HOME:root,NEXO_SYSTEM_DOWNLOADS:downloads,NODE_ENV:"test"}});
  try{
    const page=await app.firstWindow();await expect(page.locator("#root .app")).toBeVisible();
    await page.evaluate(roots=>window.nexo.updateSettings({allowedRoots:roots,autonomy:"balanced",agentLoopMode:"full",agentLegacyFallbackEnabled:false}),[downloads,documents,desktop]);
    const conversation=await page.evaluate(()=>window.nexo.createConversation("File stem E2E"));
    const task=await page.evaluate(id=>window.nexo.startChatTask(id,"Procure o arquivo Caderno_de_Testes_Nexo_AI",[]),conversation.id);
    await expect.poll(()=>page.evaluate(id=>window.nexo.getTask(id).then(item=>item?.status),task.id),{timeout:30_000}).toBe("completed");
    const completed=await page.evaluate(id=>window.nexo.getTask(id),task.id);
    const rendered=JSON.stringify(completed?.result??completed?.presentation??{});
    expect(rendered).toContain("Caderno_de_Testes_Nexo_AI.txt");
    expect(rendered).toContain("Caderno_de_Testes_Nexo_AI.pdf");
    expect(rendered).toContain("Caderno_de_Testes_Nexo_AI.xlsx");
    expect(rendered).not.toContain("Caderno_de_Testes_Nexo_AI_backup.txt");
    expect(chatCalls).toBe(0);
  }finally{
    await app.close();await new Promise<void>(resolve=>ollama.close(()=>resolve()));
    fs.rmSync(dataDir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});
  }
});
