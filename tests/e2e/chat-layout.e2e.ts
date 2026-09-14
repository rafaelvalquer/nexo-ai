import path from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let url: string;
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });
test.beforeAll(async () => {
  server = await createServer({
    configFile: path.resolve("apps/desktop/vite.config.ts"),
    root: path.resolve("apps/desktop/renderer"),
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error"
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("Prévia indisponível");
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

for (const viewport of [{ width: 910, height: 698 }, { width: 1280, height: 800 }]) {
  test(`mensagens ocupam apenas seu conteúdo e continuam visíveis após novos prompts em ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await page.getByRole("button", { name: "Assistente", exact: true }).click();
    for (let index = 1; index <= 4; index++) {
      await page.getByRole("textbox", { name: "Mensagem para o Nexo" }).fill(`Prompt ${index}: responda brevemente para verificar o espaçamento.`);
      await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      const streaming = page.locator(".chatMessage.streaming");
      await expect(streaming).toBeVisible();
      // The old .assistant page rule made this article almost viewport-height.
      expect((await streaming.boundingBox())!.height).toBeLessThan(250);
      await expect(page.locator(".chatMessage.assistant:not(.streaming)")).toHaveCount(index);
      await expect.poll(() => page.evaluate(() => {
        const chat = document.querySelector(".chatViewport")!;
        const message = chat.querySelector(".chatMessage:last-child .messageContent")!;
        const viewport = chat.getBoundingClientRect(), content = message.getBoundingClientRect();
        return content.top >= viewport.top - 1 && content.bottom <= viewport.bottom + 1;
      })).toBe(true);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        messages: [...document.querySelectorAll(".chatMessage.assistant")].map(message => message.getBoundingClientRect().height)
      }));
      expect(dimensions.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dimensions.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(dimensions.messages.every(height => height < 120)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath("chat-spacing.png") });
  });
}
