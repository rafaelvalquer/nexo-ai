import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer,url:string;
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("tool catalog exposes skeleton, friendly retry and stale recovery states",async({page})=>{
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    let reject!: (error:Error)=>void;
    api.status=()=>new Promise((_resolve,rejectStatus)=>{reject=rejectStatus;(window as any).__toolCatalogPending=true;});
    (window as any).__rejectToolCatalog=()=>reject(new Error("ECONNREFUSED private tool catalog"));
  });
  await page.evaluate(async()=>{const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setPage("Ferramentas");});
  await expect(page.getByRole("status",{name:"Carregando ferramentas"})).toBeVisible();
  await page.waitForFunction(()=>Boolean((window as any).__toolCatalogPending));
  await page.evaluate(()=>{(window as any).__rejectToolCatalog();});
  const failure=page.getByRole("alert");
  await expect(failure.getByRole("heading",{name:"Não foi possível carregar as ferramentas"})).toBeVisible();
  await expect(failure).toContainText("Não consegui carregar as ferramentas. Tente novamente.");
  await expect(failure).not.toContainText("ECONNREFUSED");
  await page.evaluate(()=>{(window as any).nexo.status=async()=>({tools:[{name:"file.search",description:"Pesquisar arquivos autorizados",risk:"READ",domain:"filesystem",enabled:true}]});});
  await failure.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByRole("heading",{name:"Arquivos"})).toBeVisible();
  await expect(page.getByText("file.search")).toBeVisible();

  await page.evaluate(()=>{(window as any).nexo.status=async()=>{throw new Error("ECONNRESET private tool catalog");};});
  await page.getByRole("button",{name:"Atualizar catálogo de ferramentas"}).click();
  await expect(page.getByRole("status").filter({hasText:"Exibindo as ferramentas carregadas anteriormente"})).toBeVisible();
  await expect(page.getByText("file.search")).toBeVisible();
  await page.evaluate(()=>{(window as any).nexo.status=async()=>({tools:[{name:"file.search",description:"Pesquisar arquivos autorizados",risk:"READ",domain:"filesystem",enabled:true}]});});
  await page.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByRole("status").filter({hasText:"Exibindo as ferramentas carregadas anteriormente"})).toHaveCount(0);
});

test("empty tool catalog is distinct from loading, errors and unmatched search",async({page})=>{
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{(window as any).nexo.status=async()=>({tools:[]});});
  await page.evaluate(async()=>{const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setPage("Ferramentas");});
  await expect(page.getByRole("status").filter({hasText:"Nenhuma ferramenta disponível"})).toBeVisible();
  await expect(page.getByRole("status",{name:"Carregando ferramentas"})).toHaveCount(0);
});
