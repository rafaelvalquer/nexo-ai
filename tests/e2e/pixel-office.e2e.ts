import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Electron abre o Pixel Office e recebe evento real", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-e2e-"));
  const executablePath = path.resolve("node_modules/electron/dist/electron.exe");
  const application = await electron.launch({
    executablePath,
    args: [path.resolve("apps/desktop")],
    env: {
      ...process.env,
      NEXO_DATA_DIR: dataDir,
      NEXO_CORE_PORT: "0",
      NODE_ENV: "test"
    }
  });

  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await expect(page.locator("#root .app")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Pular por enquanto" }).click();
    await page.getByRole("button", { name: "Escritório" }).click();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Pixel Office", { exact: true })).toBeVisible();
    await page.evaluate(() => window.nexo.startChatTask("responda apenas oi"));
    await expect(page.getByText(/Entendendo pedido|Classificando|IA local|Não foi possível/).first()).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("aprovação retoma a mesma tarefa e o Pixel Office volta ao idle", async () => {
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
  await new Promise<void>(resolve => ollama.listen(0, "127.0.0.1", resolve));
  const address = ollama.address();
  if (!address || typeof address === "string") throw new Error("Servidor Ollama de teste não iniciou.");

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-approval-e2e-"));
  const application = await electron.launch({
    executablePath: path.resolve("node_modules/electron/dist/electron.exe"),
    args: [path.resolve("apps/desktop")],
    env: {
      ...process.env,
      NEXO_DATA_DIR: dataDir,
      NEXO_CORE_PORT: "0",
      NEXO_OLLAMA_URL: `http://127.0.0.1:${address.port}`,
      NODE_ENV: "test"
    }
  });

  try {
    const page = await application.firstWindow();
    await expect(page.locator("#root .app")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Pular por enquanto" }).click();
    await page.getByRole("button", { name: "Escritório" }).click();
    const task = await page.evaluate(() => window.nexo.startChatTask("Execute uma operação persistente de preferência no computador"));
    await expect(page.getByRole("region", { name: "Aprovação necessária" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id)).toBe("waiting_approval");
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect.poll(() => page.evaluate(id => window.nexo.getTask(id).then(item => item?.status), task.id), { timeout: 15_000 }).toBe("completed");
    await expect(page.locator(".officeStatus")).toContainText("Disponível", { timeout: 5_000 });
  } finally {
    await application.close();
    await new Promise<void>(resolve => ollama.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
