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

test("núcleo interativo abre atalhos, pausa e acompanha estados reais", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()); });
  await page.goto(url);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.locator(".nucleusCanvas canvas")).toBeVisible();
  await page.locator(".nucleusSurface").hover({ position: { x: 70, y: 90 } });
  await page.screenshot({ path: info.outputPath("nucleus-desktop.png") });
  await page.getByRole("button", { name: "Pausar animação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retomar animação" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Explorar núcleo", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Atalhos do núcleo" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("nucleus-expanded.png") });
  await page.getByRole("button", { name: "Conversar", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem para o Nexo" })).toBeVisible();
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.evaluate(async modulePath => {
    const { useVisualStore } = await import(modulePath);
    useVisualStore.getState().set("awaiting-approval", "Aguardando sua aprovação");
  }, "/stores/visual.ts");
  await expect(page.locator(".nucleusState")).toContainText("Aguardando sua aprovação");
  await page.setViewportSize({ width: 910, height: 698 });
  await page.screenshot({ path: info.outputPath("nucleus-910.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("movimento reduzido mantém o conceito e os controles de teclado sem WebGL", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto(url);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.locator(".nucleusFallback")).toBeVisible();
  await expect(page.locator(".nucleusCanvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Explorar núcleo do Nexo", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Atalhos do núcleo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Atalhos do núcleo" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("nucleus-reduced-motion.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
