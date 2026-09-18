import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("macro library distinguishes empty, unavailable, and stale data states",async({page},info)=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;let fail=true;
    api.listAutomations=async()=>{if(fail)throw new Error("SQLITE_BUSY: private database details");return[{id:"macro-local",name:"Resumo local",description:"Resumo de arquivos",prompt:"Resumir arquivos",enabled:true,status:"active",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0}];};
    (window as any).__setMacroLoadFailure=(value:boolean)=>{fail=value;};
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await expect(page.getByRole("alert").getByText("Não foi possível carregar suas macros")).toBeVisible();
  await expect(page.locator(".automationEmpty")).toHaveCount(0);
  await expect(page.getByRole("alert")).not.toContainText("SQLITE_BUSY");
  await page.evaluate(()=> (window as any).__setMacroLoadFailure(false));
  await page.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByText("Resumo local",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("macro-list.png")});
  await page.evaluate(()=> (window as any).__setMacroLoadFailure(true));
  await page.getByRole("button",{name:"Atualizar macros"}).click();
  await expect(page.getByRole("status")).toContainText("Exibindo a lista carregada anteriormente.");
  await expect(page.getByText("Resumo local",{exact:true})).toBeVisible();
});

test("natural macro drafts are reviewed and completed before saving",async({page},info)=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.listAutomations=async()=>[];
    api.listAutomationActions=async()=>[{id:"system.open_application",title:"Abrir aplicativo",description:"Abre um aplicativo",category:"apps",fields:[{key:"application",label:"Aplicativo",type:"text",required:true}],risk:"write"}];
    api.draftMacroFromNatural=async({description}:any)=>({name:"Começar Trabalho",description,actions:[{id:"step-1",type:"system.open_application",config:{application:""}}]});
    api.testAutomationDraft=async(value:any)=>{(window as any).__testedDraft=value;return{id:"draft-test",status:"success",summary:"Simulação concluída.",steps:[{id:"step-test",ordinal:1,actionType:"system.open_application",status:"success",summary:"Simulação: abriria chrome."}]};};
    api.createAutomationV2=async(value:any)=>{(window as any).__createdMacro=value;return value;};
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByRole("button",{name:"Nova macro",exact:true}).click();
  await page.getByLabel("O que esta macro deve fazer?").fill("Abra o Chrome e a pasta Projetos para começar o trabalho.");
  await page.getByRole("button",{name:"Gerar etapas com IA"}).click();
  await expect(page.getByLabel("Nome")).toHaveValue("Começar Trabalho");
  await expect(page.getByText("1. Abrir aplicativo",{exact:true})).toBeVisible();
  await page.getByRole("textbox",{name:"Aplicativo",exact:true}).fill("chrome");
  await page.getByRole("button",{name:"Testar rascunho (simulação)"}).click();
  await expect(page.getByText("Simulação concluída.",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("macro-editor.png")});
  const tested=await page.evaluate(()=>((window as any).__testedDraft));
  expect(tested).toMatchObject({enabled:false,trigger:{type:"manual"},actions:[{type:"system.open_application",config:{application:"chrome"}}]});
  await page.getByRole("button",{name:"Salvar e ativar",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__createdMacro))).toBe(true);
  const saved=await page.evaluate(()=>((window as any).__createdMacro.actions[0].config.application));
  expect(saved).toBe("chrome");
});

test("a browser download step requires its selector and explicit destination",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.listAutomations=async()=>[];
    api.listAutomationActions=async()=>[{id:"browser.download",title:"Baixar arquivo pelo navegador",description:"Download protegido",category:"browser",risk:"sensitive",fields:[{key:"selector",label:"Seletor do botão ou link",type:"text",required:true},{key:"path",label:"Caminho completo do arquivo",type:"path",required:true}]}];
    api.createAutomationV2=async(value:any)=>{(window as any).__createdMacro=value;return value;};
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByRole("button",{name:"Nova macro",exact:true}).click();
  await page.getByLabel("Nome",{exact:true}).fill("Baixar relatório");
  await page.getByRole("button",{name:"Adicionar etapa",exact:true}).click();
  await page.getByLabel("Seletor do botão ou link",{exact:true}).fill("#export-csv");
  await page.getByLabel("Caminho completo do arquivo",{exact:true}).fill("C:\\Users\\Teste\\Downloads\\report.csv");
  await page.getByRole("button",{name:"Salvar pausada",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__createdMacro))).toBe(true);
  const action=await page.evaluate(()=>((window as any).__createdMacro.actions[0]));
  expect(action).toMatchObject({type:"browser.download",config:{selector:"#export-csv",path:"C:\\Users\\Teste\\Downloads\\report.csv"}});
});

test("macro details exposes a dry-run test and opens its execution steps",async({page},info)=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo,macro={id:"macro-demo",name:"Demonstração",description:"Teste",prompt:"Teste",enabled:false,status:"paused",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0};
    api.listAutomations=async()=>[macro];api.listAutomationRuns=async()=>[];
    api.testAutomation=async(id:string)=>{(window as any).__testedMacro=id;return{id:"run-dry",automationId:id,status:"success",startedAt:new Date().toISOString()};};
    api.getAutomationRun=async()=>({id:"run-dry",status:"success",startedAt:new Date().toISOString(),steps:[{id:"step-dry",ordinal:1,actionType:"system.open_application",status:"success",summary:"Simulação: abriria Chrome."}]});
    api.runAutomation=async(id:string)=>new Promise(resolve=>{(window as any).__finishMacroRun=()=>resolve({id:"run-live",automationId:id,status:"running",startedAt:new Date().toISOString()});});
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByText("Demonstração",{exact:true}).click();
  await page.getByRole("button",{name:"Testar (simulação)"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__testedMacro)).toBe("macro-demo");
  await expect(page.getByText("Simulação: abriria Chrome.",{exact:true})).toBeVisible();
  const details=page.getByRole("dialog");
  await details.getByRole("button",{name:"Executar agora"}).click();
  await expect(details.getByRole("button",{name:"Executando…"})).toBeVisible();
  await page.screenshot({path:info.outputPath("macro-running.png")});
  await page.evaluate(()=> (window as any).__finishMacroRun());
  await expect(details.getByRole("button",{name:"Executar agora"})).toBeVisible();
});

test("macro execution exposes accessible step progress in the detail drawer",async({page},info)=>{
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{
    const api=(window as any).nexo,now=new Date().toISOString();
    api.listAutomations=async()=>[{id:"macro-progress",name:"Resumo semanal",description:"Compilar dados",prompt:"Compilar dados",enabled:true,status:"running",trigger:{type:"manual"},actions:[{id:"one"},{id:"two"},{id:"three"}],output:{type:"notification"},policy:{},consecutiveFailures:0}];
    api.listAutomationRuns=async()=>[{id:"run-progress",automationId:"macro-progress",status:"running",startedAt:now}];
    api.getAutomationRun=async()=>({id:"run-progress",automationId:"macro-progress",status:"running",startedAt:now,steps:[{id:"one",ordinal:1,actionType:"file.search",status:"success",summary:"Arquivos localizados"},{id:"two",ordinal:2,actionType:"document.analyze",status:"running",summary:"Analisando relatórios"}]});
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByText("Resumo semanal",{exact:true}).click();
  const details=page.getByRole("dialog",{name:"Resumo semanal"});
  await details.getByRole("button",{name:"Etapas"}).click();
  const progress=details.getByRole("progressbar",{name:"Progresso da macro Resumo semanal"});
  await expect(progress).toHaveAttribute("aria-valuenow","1");
  await expect(progress).toHaveAttribute("aria-valuemax","3");
  await expect(progress).toHaveAttribute("aria-valuetext","Etapa 2 de 3");
  await expect(details.locator(".macroExecutionProgress b")).toHaveText("Analisando relatórios");
  await page.screenshot({path:info.outputPath("macro-progress.png")});
});

test("macro editor supports keyboard reordering and deletion uses an accessible confirmation",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url);
  await page.waitForFunction(()=>Boolean((window as any).nexo));
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    const macro={id:"macro-delete",name:"Rotina de teste",description:"Teste",prompt:"Teste",enabled:false,status:"paused",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0};
    api.listAutomations=async()=>[macro];
    api.listAutomationRuns=async()=>[];
    api.listAutomationActions=async()=>[{id:"system.open_application",title:"Abrir aplicativo",description:"Abre um aplicativo",category:"apps",fields:[{key:"application",label:"Aplicativo",type:"text",required:true}],risk:"write"},{id:"system.open_url",title:"Abrir navegador",description:"Abre uma URL",category:"apps",fields:[{key:"url",label:"URL",type:"text",required:true}],risk:"read"}];
    api.removeAutomation=async(id:string)=>{(window as any).__removedMacro=id;return{ok:true};};
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByRole("button",{name:"Nova macro",exact:true}).click();
  await page.getByLabel("Nome",{exact:true}).fill("Ordem de etapas");
  await page.getByRole("button",{name:"Adicionar etapa",exact:true}).click();
  await page.getByLabel("Adicionar etapa manual").selectOption("system.open_url");
  await page.getByRole("button",{name:"Adicionar etapa",exact:true}).click();
  const firstHandle=page.getByRole("button",{name:/Arrastar etapa 1/});
  await firstHandle.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator(".macroStepHeading b").first()).toContainText("Abrir navegador");
  await expect(page.locator(".reorderAnnouncement")).toContainText("posição 2 de 2");
  await page.locator(".macroStepList li").first().locator(".macroDragHandle").dragTo(page.locator(".macroStepList li").nth(1));
  await expect(page.locator(".macroStepHeading b").first()).toContainText("Abrir aplicativo");
  await page.getByRole("button",{name:"Fechar painel"}).click();
  await page.getByRole("button",{name:"Ações de Rotina de teste",exact:true}).click();
  await page.getByRole("button",{name:"Excluir",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Excluir macro?"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Cancelar"}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button",{name:"Ações de Rotina de teste",exact:true}).click();
  await page.getByRole("button",{name:"Excluir",exact:true}).click();
  await page.getByRole("dialog",{name:"Excluir macro?"}).getByRole("button",{name:"Excluir macro",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__removedMacro)).toBe("macro-delete");
});

test("Macros mantêm criar e filtrar utilizáveis sem overflow nos breakpoints do produto",async({page},info)=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo;api.listAutomations=async()=>[];api.listAutomationRuns=async()=>[];});
  await page.locator(".sidebar").getByRole("button",{name:"Macros",exact:true}).click();
  for(const viewport of [{width:800,height:700},{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button",{name:"Nova macro",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Macros overflow at ${viewport.width}px`).toBe(true);
    await page.screenshot({path:info.outputPath(`macros-responsive-${viewport.width}.png`)});
  }
});
