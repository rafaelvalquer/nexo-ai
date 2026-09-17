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

test("document preview uses the shared drawer and keeps version actions accessible", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(() => {
    const api = (window as any).nexo;
    let versions = [{ id: "version-1", version: 1, changeSummary: "Original", createdAt: new Date().toISOString() }];
    api.listRecentDocuments = async () => [{ id: "document-1", name: "Relatorio.pdf", mimeType: "application/pdf", sizeBytes: 4, status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    api.documentPreviewData = async () => ({ mimeType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) });
    api.listDocumentVersions = async () => versions;
    api.editDocument = async () => { versions = [...versions, { id: "version-2", version: 2, changeSummary: "Texto substituído", createdAt: new Date().toISOString() }]; return { id: "edit-task" }; };
    api.getTask = async () => ({ id: "edit-task", status: "completed" });
  });

  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("O que deseja fazer?").fill("abrir documentos");
  await page.getByRole("option", { name: "Abrir Documentos" }).click();
  const previewButton = page.getByRole("button", { name: "Ver prévia" });
  await previewButton.click();

  const drawer = page.getByRole("dialog", { name: "Relatorio.pdf" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Histórico de versões")).toContainText("v1 · Original");
  await expect(drawer.getByTitle("Prévia de Relatorio.pdf")).toBeVisible();
  await drawer.getByLabel("Texto a substituir").fill("antigo");
  await drawer.getByLabel("Novo texto").fill("novo");
  await drawer.getByRole("button", { name: "Criar nova versão" }).click();
  await expect(drawer.getByRole("status")).toContainText("Nova versão criada");
  await expect(drawer.getByLabel("Histórico de versões")).toContainText("v2 · Texto substituído");

  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(previewButton).toBeFocused();
});
