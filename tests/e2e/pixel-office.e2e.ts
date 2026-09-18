import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

async function listen(server:http.Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor Ollama de teste não iniciou.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server:http.Server) {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

test("Electron abre o Pixel Office e recebe evento real", async () => {
  const ollama = http.createServer((request, response) => {
    if (request.url === "/api/tags") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ models: [{ name: "qwen3:1.7b" }] }));
      return;
    }
    if (request.url !== "/api/chat") {
      response.statusCode = 404;
      response.end("{}");
      return;
    }
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.write(JSON.stringify({ message: { thinking: "atividade interna" }, done: false }) + "\n");
      setTimeout(() => {
        response.write(JSON.stringify({ message: { content: "Oi" }, done: false }) + "\n");
        response.end(JSON.stringify({ message: { content: "!" }, done: true }) + "\n");
      }, 250);
    });
  });
  const ollamaUrl = await listen(ollama);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-e2e-"));
  const executablePath = path.resolve("node_modules/electron/dist/electron.exe");
  const application = await electron.launch({
    executablePath,
    args: [path.resolve("apps/desktop")],
    env: {
      ...process.env,
      NEXO_DATA_DIR: dataDir,
      NEXO_CORE_PORT: "0",
      NEXO_OLLAMA_URL: ollamaUrl,
      NEXO_MODEL: "qwen3:1.7b",
      NODE_ENV: "test"
    }
  });

  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await expect(page.locator("#root .app")).toBeVisible({ timeout: 15_000 });
    const welcome=page.getByRole("dialog",{name:"Seu assistente local está pronto para ser configurado."});
    await expect(welcome.getByRole("button",{name:"Pular configuração"})).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(welcome.getByRole("button",{name:"Concluir"})).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(welcome.getByRole("button",{name:"Pular configuração"})).toBeFocused();
    await welcome.getByRole("button",{name:"Abrir Configurações"}).first().click();
    await expect(welcome).toHaveCount(0);
    await expect(page.getByRole("heading",{name:"Configurações",exact:true})).toBeVisible();
    await page.evaluate(() => window.nexo.updateSettings({ agentLoopMode: "legacy" }));
    await page.getByRole("button", { name: "Escritório", exact: true }).click();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Pixel Office", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Assistente", exact: true }).click();
    await expect(page.locator(".assistantPage")).toBeVisible();
    await page.getByRole("button", { name: "Escritório", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(1);
    const task = await page.evaluate(() => window.nexo.startChatTask("responda apenas oi"));
    await expect.poll(() => page.evaluate(() => window.nexo.getVisualSnapshot().then(snapshot => snapshot.recent.some(event => event.type === "response.streaming"))), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 15_000 }).toBe("completed");
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await close(ollama);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("aprovação retoma a mesma tarefa e o Pixel Office volta ao idle", async ({},testInfo) => {
  let chatCalls = 0;
  const ollama = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({ models: [{ name: "qwen3:4b" }] }));
      return;
    }
    if (request.url !== "/api/chat") {
      response.statusCode = 404;
      response.end("{}");
      return;
    }
    request.resume();
    request.on("end", () => {
      chatCalls += 1;
      const content = chatCalls === 1
        ? JSON.stringify({ tool: "memory_save", input: { key: "e2e.preference", value: "pixel office", category: "preference" }, explanation: "Salvar preferência do teste" })
        : JSON.stringify({ direct: "Preferência salva com aprovação." });
      response.end(JSON.stringify({ message: { content } }));
    });
  });
  const ollamaUrl = await listen(ollama);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-approval-e2e-"));
  const application = await electron.launch({
    executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [path.resolve("apps/desktop")],
    env: {
      ...process.env,
      NEXO_DATA_DIR: dataDir,
      NEXO_CORE_PORT: "0",
      NEXO_OLLAMA_URL: ollamaUrl,
      NODE_ENV: "test"
    }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.locator("#root .app")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Pular por enquanto" }).click();
    await page.evaluate(() => window.nexo.updateSettings({ agentLoopMode: "legacy" }));
    await page.getByRole("button", { name: "Escritório", exact: true }).click();
    const task = await page.evaluate(() => window.nexo.startChatTask("Execute uma operação persistente de preferência no computador"));
    await expect(page.getByRole("region", { name: "Aprovação necessária" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id)).toBe("waiting_approval");
    await page.screenshot({path:testInfo.outputPath("office-execution-approval.png")});
    await page.getByRole("button",{name:"Detalhes do Polvo"}).click();
    const officeDrawer=page.getByRole("dialog",{name:"Polvo Nexo"});
    await expect(officeDrawer).toBeVisible();
    await expect(officeDrawer).toContainText("Esperando aprovação");
    await expect(officeDrawer.getByText("Aguardando autorização")).toBeVisible();
    await expect(officeDrawer.getByText("Tempo decorrido")).toBeVisible();
    await expect(officeDrawer.getByRole("progressbar",{name:/Andamento da tarefa/})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath("office-execution-drawer.png")});
    await officeDrawer.getByRole("button",{name:"Fechar painel"}).click();
    await expect(officeDrawer).not.toBeVisible();
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect.poll(() => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 15_000 }).toBe("completed");
    await expect(page.locator(".officeStatus")).toContainText("Disponível", { timeout: 5_000 });
  } finally {
    await application.close();
    await close(ollama);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
