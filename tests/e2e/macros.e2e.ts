import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("natural macro drafts are reviewed and completed before saving",async({page})=>{
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

test("macro details exposes a dry-run test and opens its execution steps",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo,macro={id:"macro-demo",name:"Demonstração",description:"Teste",prompt:"Teste",enabled:false,status:"paused",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0};
    api.listAutomations=async()=>[macro];api.listAutomationRuns=async()=>[];
    api.testAutomation=async(id:string)=>{(window as any).__testedMacro=id;return{id:"run-dry",automationId:id,status:"success",startedAt:new Date().toISOString()};};
    api.getAutomationRun=async()=>({id:"run-dry",status:"success",startedAt:new Date().toISOString(),steps:[{id:"step-dry",ordinal:1,actionType:"system.open_application",status:"success",summary:"Simulação: abriria Chrome."}]});
  });
  await page.getByRole("button",{name:"Macros",exact:true}).click();
  await page.getByText("Demonstração",{exact:true}).click();
  await page.getByRole("button",{name:"Testar (simulação)"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__testedMacro)).toBe("macro-demo");
  await expect(page.getByText("Simulação: abriria Chrome.",{exact:true})).toBeVisible();
});
