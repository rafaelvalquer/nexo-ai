import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("the simplified navigation exposes developer tool logs only when enabled",async({page})=>{
  await page.goto(url);
  await expect(page.locator(".sidebar nav button")).toHaveCount(4);
  await page.evaluate(async()=>{const api=(window as any).nexo;api.intentLearningCount=async()=>0;api.getBrowserPersonalProfileEnabled=async()=>false;api.setBrowserPersonalProfileEnabled=async(value:boolean)=>value;api.listAudit=async()=>[{id:"audit-1",action:"open_file",risk:"READ",status:"SUCCEEDED",createdAt:"2026-09-16T12:00:00.000Z",details:{durationMs:42}}];const current=await api.getSettings();api.updateSettings=async(patch:any)=>Object.assign({},current,patch);});
  await page.getByRole("button",{name:"Configurações",exact:true}).click();
  await expect(page.getByLabel("Modo desenvolvedor: mostrar logs técnicos")).not.toBeChecked();
  await expect(page.getByText("Modo do Agent")).toHaveCount(0);
  await page.getByLabel("Modo desenvolvedor: mostrar logs técnicos").check();
  await expect(page.getByText("Execuções recentes")).toBeVisible();
  await page.getByText("Execuções recentes").click();
  await expect(page.getByText("open_file",{exact:true})).toBeVisible();
  await expect(page.getByText("42 ms",{exact:true})).toBeVisible();
});
