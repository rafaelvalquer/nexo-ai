import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let url: string;
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: path.resolve("apps/desktop/renderer"), server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("Prévia indisponível");
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

async function mount(page: Page) {
  await page.route("**/__office_test", route => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0;background:#090d18"><div id="office" style="position:absolute;inset:0"></div></body></html>' }));
  await page.goto(`${url}/__office_test`);
  await page.evaluate(async modulePath => {
    const { OfficeEngine } = await import(modulePath);
    const engine = new OfficeEngine();
    (window as any).officeTest = engine;
    await engine.mount(document.getElementById("office")!, () => {}, () => {});
    engine.setAutoFocus(false);
  }, "/pixel-office/engine/OfficeEngine.ts");
}
async function snapshot(page: Page) { return page.evaluate(() => (window as any).officeTest.debug()); }
async function work(page: Page) {
  await page.evaluate(() => {
    const labels = ["Lendo o relatório semanal", "Consultando os e-mails", "Pesquisando referências", "Organizando a agenda"];
    for (let index = 1; index <= 4; index++) (window as any).officeTest.consume({ eventId: `work-${index}`, runId: `run-${index}`, agentId: `agent-${index}`, type: "tool.progress", state: "executing-tool", stationId: "document-station", label: labels[index - 1], timestamp: new Date().toISOString(), metadata: { chatTitle: "Planejamento semanal" } });
  });
}

test("quatro polvos passeiam, voltam às mesas e mostram a atividade atual", async ({ page }, info) => {
  // This test captures several full-scene screenshots and exercises Pixi rendering.
  // Windows CI software rendering can be substantially slower than a local GPU.
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mount(page);
  await expect.poll(async () => (await snapshot(page)).agentDistance, { timeout: 20000 }).toBeGreaterThan(20);
  await work(page);
  await expect.poll(async () => (await snapshot(page)).agents.every((agent: any) => agent.atDesk && !agent.wander), { timeout: 20000 }).toBe(true);
  expect((await snapshot(page)).navigationFailures).toBe(0);
  await page.screenshot({ path: info.outputPath("four-desks-working.png") });
  for (const zoom of [1, 1.25, 1.5]) {
    await page.evaluate(value => (window as any).officeTest.setZoom(document.getElementById("office"), value), zoom);
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath(`zoom-${zoom}.png`) });
  }
  await page.setViewportSize({ width: 640, height: 800 });
  await page.evaluate(() => (window as any).officeTest.setZoom(document.getElementById("office"), "fit"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath("narrow.png") });
  await page.evaluate(() => {
    for (let index = 1; index <= 4; index++) (window as any).officeTest.consume({ eventId: `end-${index}`, runId: `run-${index}`, agentId: `agent-${index}`, type: "run.completed", state: "success", label: "Concluído", timestamp: new Date().toISOString() });
  });
  await expect.poll(async () => (await snapshot(page)).activeAgents, { timeout: 20000 }).toBe(0);
  expect(errors).toEqual([]);
});

test("restauração e movimento reduzido mantêm as quatro mesas", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const engine = (window as any).officeTest;
    engine.setReducedMotion(true);
    engine.restore([1, 2, 3, 4].map(index => ({ eventId: `restore-${index}`, runId: `restore-${index}`, agentId: `agent-${index}`, type: "approval.requested", state: "awaiting-approval", stationId: "approval-gate", label: "Aguardando autorização", timestamp: new Date().toISOString() })));
  });
  expect((await snapshot(page)).agents.every((agent: any) => agent.atDesk && agent.status === "Aguardando autorização")).toBe(true);
  expect((await snapshot(page)).activeAgents).toBe(4);
});
