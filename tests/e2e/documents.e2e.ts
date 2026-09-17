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

test("documents expose friendly retry and stale-data states", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(() => {
    const api = (window as any).nexo;
    let attempts = 0;
    let failReads = true;
    api.listRecentDocuments = async () => {
      attempts += 1;
      if (failReads) throw new Error(attempts < 4 ? "SQLITE_BUSY: internal database detail" : "ECONNRESET: internal transport detail");
      return [{ id: "document-ux", name: "Plano local.pdf", mimeType: "application/pdf", sizeBytes: 4096, status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    };
    api.chooseDocument = async () => null;
    (window as any).__documentReadAttempts = () => attempts;
    (window as any).__setDocumentReadFailure = (value: boolean) => { failReads = value; };
  });

  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("O que deseja fazer?").fill("abrir documentos");
  await page.getByRole("option", { name: "Abrir Documentos" }).click();
  await expect(page.getByRole("heading", { name: "Seus documentos não estão disponíveis" })).toBeVisible();
  await expect(page.getByRole("alert")).not.toContainText("SQLITE_BUSY");
  await page.evaluate(() => (window as any).__setDocumentReadFailure(false));
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Plano local.pdf")).toBeVisible();
  await page.evaluate(() => (window as any).__setDocumentReadFailure(true));
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Exibindo os dados carregados anteriormente.");
  await expect(page.getByText("Plano local.pdf")).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("ECONNRESET");
  expect(await page.evaluate(() => (window as any).__documentReadAttempts())).toBeGreaterThan(2);
});

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
