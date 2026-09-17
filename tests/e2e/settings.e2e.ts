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

test("settings bootstrap exposes a retry state after a temporary local read failure",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo,original=api.getSettings;let attempts=0;api.getSettings=async()=>{attempts++;if(attempts===1)throw new Error("database temporarily unavailable");return original();};(window as any).__settingsReadAttempts=()=>attempts;});
  await page.getByRole("button",{name:"Configurações",exact:true}).click();
  const error=page.getByRole("alert");
  await expect(error.getByRole("heading",{name:"Não foi possível abrir esta área"})).toBeVisible();
  await expect(error.getByText("Não consegui carregar suas configurações locais.")).toBeVisible();
  await error.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByRole("heading",{name:"Configurações",exact:true})).toBeVisible();
  await expect(page.getByLabel("URL do Ollama")).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__settingsReadAttempts())).toBe(2);
});

test("dangerous settings actions use an accessible confirmation drawer",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{const api=(window as any).nexo;api.intentLearningCount=async()=>2;api.clearMemory=async()=>({ok:true});const current=await api.getSettings();api.updateSettings=async(patch:any)=>Object.assign({},current,patch);});
  await page.getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  const dialog=page.getByRole("dialog",{name:"Limpar memória?"});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/todas as memórias salvas serão removidas/i)).toBeVisible();
  await dialog.getByRole("button",{name:"Cancelar"}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  await dialog.getByRole("button",{name:"Limpar memória",exact:true}).click();
  await expect(page.getByText("As memórias salvas foram removidas.")).toBeVisible();
});

test("the settings confirmation drawer fits narrow screens without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await page.getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  await expect(page.getByRole("dialog",{name:"Limpar memória?"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/settings-confirmation-mobile.png"});
});

test("settings use side navigation on desktop and a destination selector on compact screens",async({page},testInfo)=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url);
  await page.getByRole("button",{name:"Configurações",exact:true}).click();
  const navigation=page.locator(".settingsNav");
  await expect(navigation).toBeVisible();
  expect(await navigation.evaluate(node=>getComputedStyle(node).flexDirection)).toBe("column");
  await expect(page.getByLabel("Navegar pelas configurações")).toBeHidden();
  await page.screenshot({path:testInfo.outputPath("settings-desktop-navigation.png")});
  await page.setViewportSize({width:390,height:844});
  expect(await navigation.evaluate(node=>getComputedStyle(node).flexDirection)).toBe("row");
  const sectionSelector=page.getByLabel("Navegar pelas configurações");
  await expect(sectionSelector).toBeVisible();
  await sectionSelector.selectOption("Catálogo");
  await expect(page.locator(".settingsToolsCatalog")).toHaveAttribute("open","");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await navigation.evaluate(()=>{const panel=document.querySelector(".settings")!.getBoundingClientRect();return [...document.querySelectorAll<HTMLInputElement|HTMLSelectElement>(".settings input,.settings select")].every(control=>control.getBoundingClientRect().right<=panel.right+1);})).toBe(true);
  await page.screenshot({path:testInfo.outputPath("settings-compact-navigation.png")});
});
