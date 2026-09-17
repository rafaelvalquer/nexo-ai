import path from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let url: string;
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });
test.beforeAll(async () => {
  server = await createServer({ configFile: path.resolve("apps/desktop/vite.config.ts"), root: path.resolve("apps/desktop/renderer"), server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("Prévia indisponível");
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

const primaryNavigation = ["Assistente", "Macros", "Escritório", "Configurações"];
test("menu principal apresenta as quatro áreas do produto", async ({ page }) => {
  await page.goto(url);
  for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(page.locator(".sidebar nav button")).toHaveCount(4);
});

test("navegação mantém controles visíveis e sem overflow nos breakpoints do produto", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(url);
  for (const viewport of [{width:800,height:700},{width:900,height:760},{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}]) {
    await page.setViewportSize(viewport);
    for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${viewport.width}px`).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`responsive-${viewport.width}.png`)});
  }
});

test("sidebar recolhida persiste e a paleta abre por atalho", async ({ page }) => {
  await page.goto(url);
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Paleta de comandos" })).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("escritório");
  await expect(page.getByRole("option", { name: /Abrir Escritório/ })).toBeVisible();
  await page.getByRole("option", { name: /Abrir Escritório/ }).click();
  expect(await page.evaluate(() => localStorage.getItem("nexo.command.recent"))).toContain("Abrir Escritório");
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("option", { name: /Abrir Escritório.*Recente/ })).toBeVisible();
});

test("a command palette indexes macros and saved conversations by title", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.listAutomations=async()=>[{id:"macro-report",name:"Relatório semanal",description:"Compilar planilhas",prompt:""}];
    api.listConversations=async()=>[{id:"conversation-project",title:"Projeto Nexo",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.runAutomation=async(id:string)=>{(window as any).__runMacro=id;return{};};
  });
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("O que deseja fazer?").fill("relatório semanal");
  await expect(page.getByRole("option",{name:/Executar macro: Relatório semanal/})).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("projeto nexo");
  await expect(page.getByRole("option",{name:/Abrir conversa: Projeto Nexo/})).toBeVisible();
  await page.getByRole("option",{name:/Abrir conversa: Projeto Nexo/}).click();
  await expect(page.locator(".assistantPage")).toBeVisible();
});
