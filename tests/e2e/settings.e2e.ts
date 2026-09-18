import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("the simplified navigation exposes developer tool logs only when enabled",async({page})=>{
  await page.goto(url);
  await expect(page.locator(".sidebar nav button")).toHaveCount(5);
  await page.evaluate(async()=>{const api=(window as any).nexo;api.intentLearningCount=async()=>0;api.getBrowserPersonalProfileEnabled=async()=>false;api.setBrowserPersonalProfileEnabled=async(value:boolean)=>value;api.listAudit=async()=>[{id:"audit-1",action:"open_file",risk:"READ",status:"SUCCEEDED",createdAt:"2026-09-16T12:00:00.000Z",details:{durationMs:42}}];const current=await api.getSettings();api.updateSettings=async(patch:any)=>Object.assign({},current,patch);});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  const developerSwitch=page.getByRole("switch",{name:"Modo desenvolvedor: mostrar logs técnicos"});
  await expect(developerSwitch).toBeVisible();
  await expect(developerSwitch.locator("xpath=..")).toHaveCSS("display","flex");
  await expect(page.getByLabel("Modo desenvolvedor: mostrar logs técnicos")).not.toBeChecked();
  await expect(page.getByText("Modo do Agent")).toHaveCount(0);
  await developerSwitch.locator("xpath=..").click();
  await expect(developerSwitch).toBeChecked();
  await expect(developerSwitch).toBeChecked();
  await expect(page.getByText("Execuções recentes")).toBeVisible();
  await page.getByText("Execuções recentes").click();
  await expect(page.getByText("open_file",{exact:true})).toBeVisible();
  await expect(page.getByText("42 ms",{exact:true})).toBeVisible();
});

test("settings bootstrap exposes a retry state after a temporary local read failure",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo,original=api.getSettings;let attempts=0;api.getSettings=async()=>{attempts++;if(attempts===1)throw new Error("database temporarily unavailable");return original();};(window as any).__settingsReadAttempts=()=>attempts;});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  const error=page.getByRole("alert");
  await expect(error.getByRole("heading",{name:"Não foi possível abrir esta área"})).toBeVisible();
  await expect(error.getByText("Não consegui carregar suas configurações locais.")).toBeVisible();
  await expect(error).toHaveCSS("animation-name","nexoErrorNudge");
  await error.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByRole("heading",{name:"Configurações",exact:true})).toBeVisible();
  await expect(page.getByLabel("URL do Ollama")).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__settingsReadAttempts())).toBeGreaterThan(1);
});

test("localized error feedback respects reduced motion",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo;api.getSettings=async()=>{throw new Error("private database detail");};});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  const error=page.getByRole("alert");
  await expect(error.getByRole("heading",{name:"Não foi possível abrir esta área"})).toBeVisible();
  await expect(error).toHaveCSS("animation-name","none");
});

test("About settings expose SemVer and reproducible build identifiers",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo;api.intentLearningCount=async()=>0;api.getBrowserPersonalProfileEnabled=async()=>false;api.setBrowserPersonalProfileEnabled=async(value:boolean)=>value;});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Sobre",exact:true}).click();
  const about=page.locator(".settingsAbout");
  await expect(about.getByText("0.7.0-beta.1",{exact:false})).toBeVisible();
  await expect(about.getByText(/Commit/)).toBeVisible();
  await expect(about.getByText(/Build/)).toBeVisible();
});

test("local AI settings can test Ollama and report the connection result",async({page})=>{
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{
    const api=(window as any).nexo,original=api.getSettings;let calls=0;
    api.getSettings=async()=>({...await original(),developerDiagnosticsEnabled:false});
    api.status=async()=>{calls++;return{llm:{ok:true,detail:"Ollama local disponível"},models:["qwen3:4b"]};};
    (window as any).__statusChecks=()=>calls;
  });
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Configurações",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Testar conexão"}).click();
  await expect(page.getByRole("status").filter({hasText:"Ollama conectado"})).toBeVisible();
  await expect(page.locator(".nexoToast").filter({hasText:"IA local conectada"})).toContainText("Conectado a http://127.0.0.1:11434.");
  expect(await page.evaluate(()=>(window as any).__statusChecks())).toBeGreaterThanOrEqual(2);
});

test("local AI connection errors stay friendly unless developer diagnostics are enabled",async({page})=>{
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{const api=(window as any).nexo,original=api.getSettings;api.getSettings=async()=>({...await original(),developerDiagnosticsEnabled:false});api.updateSettings=async(patch:any)=>({...await api.getSettings(),...patch});api.status=async()=>({llm:{ok:false,detail:"ECONNREFUSED 127.0.0.1:11434 · socket hang up"},models:[]});});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Testar conexão"}).click();
  await expect(page.locator(".settingsAiStatus")).toContainText("Ollama desconectado");
  await expect(page.locator(".settingsAiStatus")).not.toContainText("ECONNREFUSED");
  await expect(page.getByText("Confira se o Ollama está aberto e se a URL configurada está correta.")).toBeVisible();
  await page.getByLabel("Modo desenvolvedor: mostrar logs técnicos").scrollIntoViewIfNeeded();
  await page.getByRole("switch",{name:"Modo desenvolvedor: mostrar logs técnicos"}).locator("xpath=..").click();
  await expect(page.getByLabel("Modo desenvolvedor: mostrar logs técnicos")).toBeChecked();
  await page.getByRole("button",{name:"Testar conexão"}).click();
  await expect(page.locator(".settingsAiStatus")).toContainText("ECONNREFUSED 127.0.0.1:11434");
});

test("dangerous settings actions use an accessible confirmation drawer",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{const api=(window as any).nexo;api.intentLearningCount=async()=>2;api.clearMemory=async()=>({ok:true});const current=await api.getSettings();api.updateSettings=async(patch:any)=>Object.assign({},current,patch);});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Memória",exact:true}).click();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  const dialog=page.getByRole("dialog",{name:"Limpar memória?"});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/todas as memórias salvas serão removidas/i)).toBeVisible();
  await dialog.getByRole("button",{name:"Cancelar"}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button",{name:"Memória",exact:true}).click();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  await dialog.getByRole("button",{name:"Limpar memória",exact:true}).click();
  await expect(page.getByText("As memórias salvas foram removidas.")).toBeVisible();
});

test("the settings confirmation drawer fits narrow screens without horizontal overflow",async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Limpar memória"}).click();
  await expect(page.getByRole("dialog",{name:"Limpar memória?"})).toBeVisible();
  await expect.poll(()=>page.locator(".nexoDrawerOverlay").evaluate(element=>getComputedStyle(element).backdropFilter)).toBe("blur(8px)");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("settings-confirmation-mobile.png")});
});

test("settings use side navigation on desktop and a destination selector on compact screens",async({page},testInfo)=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  const navigation=page.locator(".settingsNav");
  await expect(navigation).toBeVisible();
  await expect(page.getByLabel("Navegar pelas configurações")).toHaveClass(/uiSelect/);
  expect(await navigation.evaluate(node=>getComputedStyle(node).flexDirection)).toBe("column");
  await expect(page.getByLabel("Navegar pelas configurações")).toBeHidden();
  await expect(page.locator('.settingsNavLinks button[aria-current="location"]')).toHaveText("IA local");
  await expect(page.locator('.settingsNavLinks button[aria-current="location"]')).toHaveCount(1);
  await page.getByRole("button",{name:"Memória",exact:true}).click();
  await expect(page.locator('.settingsNavLinks button[aria-current="location"]')).toHaveText("Memória");
  await expect(page.locator('.settingsNavLinks button[aria-current="location"]')).toHaveCount(1);
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
  await page.setViewportSize({width:920,height:800});
  await expect(sectionSelector).toBeVisible();
  await expect(page.locator(".settingsNavLinks")).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("settings-compact-920.png")});
});

test("compact settings selector opens deep sections and uses native immediate scrolling for reduced motion",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  const selector=page.getByRole("combobox",{name:"Navegar pelas configurações"});
  await expect(selector).toBeVisible();
  await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options?:ScrollIntoViewOptions){if(this.matches(".settingsAbout,.settingsToolsCatalog,.settingsConnections")||this.matches(".settings h3"))(window as any).__settingsNavigationBehavior=options?.behavior??"auto";return original.call(this,options);};});
  await selector.selectOption("Sobre");
  await expect(page.locator(".settingsAbout")).toHaveAttribute("open","");
  await expect(page.locator(".settingsAbout").getByRole("heading",{name:"Nexo AI"})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__settingsNavigationBehavior)).toBe("auto");
  await expect(selector).toHaveValue("Sobre");
  await selector.selectOption("Catálogo");
  await expect(page.locator(".settingsToolsCatalog")).toHaveAttribute("open","");
  await expect(selector).toHaveValue("Catálogo");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Settings mantém seletor de seção, conteúdo e ações sem overflow nos breakpoints desktop",async({page},info)=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  for(const viewport of [{width:800,height:700},{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading",{name:"Configurações",exact:true})).toBeVisible();
    if(viewport.width<=959) await expect(page.getByLabel("Navegar pelas configurações")).toBeVisible();
    else await expect(page.locator(".settingsNavLinks")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Settings overflow at ${viewport.width}px`).toBe(true);
    await page.screenshot({path:info.outputPath(`settings-responsive-${viewport.width}.png`)});
  }
});
