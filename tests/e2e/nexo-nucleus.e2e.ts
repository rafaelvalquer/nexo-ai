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
const retiredNavigation = ["Hoje", "Atividade", "Aprovações", "Automações", "Conexões", "Memória"];

test("menu principal apresenta somente as quatro áreas do produto", async ({ page }) => {
  await page.goto(url);
  for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  for (const label of retiredNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
});

test("navegação simplificada mantém o layout sem overflow em viewport estreita", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto(url);
  for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 910, height: 760 });
  for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
});

test("sidebar recolhida persiste e a paleta abre por atalho", async ({ page }) => {
  await page.goto(url);
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.keyboard.press("Control+Space");
  await expect(page.getByRole("dialog", { name: "Paleta de comandos" })).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("escritório");
  await expect(page.getByRole("option", { name: /Abrir Escritório/ })).toBeVisible();
  await page.getByRole("option", { name: /Abrir Escritório/ }).click();
  expect(await page.evaluate(() => localStorage.getItem("nexo.command.recent"))).toContain("Abrir Escritório");
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("option", { name: /Abrir Escritório.*Recente/ })).toBeVisible();
});
