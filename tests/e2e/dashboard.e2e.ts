import path from "node:path";
import {expect,test} from "@playwright/test";
import {createServer,type ViteDevServer} from "vite";

let server:ViteDevServer;let url:string;
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Prévia indisponível");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("Dashboard usa fallback neural sem átomo e mostra cinco atalhos",async({page})=>{
  await page.goto(url);await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  await expect(page.getByText("NEXO CORE",{exact:false}).first()).toBeVisible();await expect(page.locator(".nucleusFallback")).toHaveCount(0);await expect(page.locator(".neuralFallback, .nucleusCanvas").first()).toBeVisible();
  await page.getByRole("button",{name:"Explorar núcleo"}).click();await expect(page.locator(".nucleusSatellites button")).toHaveCount(5);
  for(const className of ["satelliteAssistant","satelliteDocuments","satelliteOffice","satelliteMacros","satelliteSettings"])await expect(page.locator(`.${className}`)).toHaveCount(1);
});

test("Dashboard mantém ações e conteúdo sem overflow nos breakpoints desktop",async({page},testInfo)=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Meu dashboard/})).toBeVisible();
  for(const viewport of [{width:800,height:700},{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await expect(page.locator(".dashboardAddButton")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Dashboard overflow at ${viewport.width}px`).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`dashboard-responsive-${viewport.width}.png`)});
  }
});

test("catálogo de gadgets usa NexoDrawer e restaura foco ao fechar com Escape",async({page},testInfo)=>{
  await page.goto(url);await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const opener=page.locator(".dashboardAddButton");await opener.click();
  const drawer=page.getByRole("dialog",{name:"Adicionar gadget"});await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button",{name:"Fechar painel"})).toBeFocused();
  await page.screenshot({path:testInfo.outputPath("dashboard-gadget-drawer.png")});
  await page.keyboard.press("Escape");await expect(drawer).not.toBeVisible();await expect(opener).toBeFocused();
});

test("adiciona E-mail e Agenda pelo catálogo e restaura layout no reload",async({page})=>{
  await page.goto(url);await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();await expect(page.getByRole("heading",{name:/Meu dashboard/})).toBeVisible();
  await expect(page.getByText("Tech Pulse")).toHaveCount(0);const addGadget=page.locator(".dashboardAddButton");await expect(addGadget).toBeVisible();
  for(const title of ["E-mail","Agenda de hoje"]){await addGadget.click();const dialog=page.getByRole("dialog",{name:"Adicionar gadget"});await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:new RegExp(title)}).click();await page.getByRole("button",{name:"Adicionar ao dashboard"}).click();await expect(page.locator(".gadgetCatalog")).toHaveCount(0);}
  await expect(page.locator(".gadgetCard").filter({hasText:"E-mail"})).toBeVisible();await expect(page.locator(".gadgetCard").filter({hasText:"Agenda de hoje"})).toBeVisible();
  await page.reload();await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();await expect(page.locator(".gadgetCard").filter({hasText:"E-mail"})).toBeVisible();await expect(page.locator(".gadgetCard").filter({hasText:"Agenda de hoje"})).toBeVisible();
});

test("email gadget opens its message in the shared drawer and sends only after explicit submit",async({page})=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Assistente",exact:true}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({timeout:15000});
  await page.evaluate(()=>{
    const api=(window as any).nexo.dashboard;
    api.getLayout=async()=>[{instanceId:"mail-home",gadgetId:"email",enabled:true,size:"M",position:0,configuration:{}}];
    api.getGadgetData=async()=>({data:{available:true,connectionId:"mail-account",unreadCount:1,messages:[{id:"mail-1",threadId:"thread-1",from:{name:"Equipe Nexo",email:"team@example.com"},subject:"Resumo da semana",snippet:"Resumo curto da mensagem.",receivedAt:"2026-09-17T12:00:00.000Z",isUnread:true,hasAttachments:false}]},fetchedAt:new Date().toISOString(),stale:false});
    api.getEmailMessage=async()=>({id:"mail-1",subject:"Resumo da semana",bodyText:"Conteúdo completo da mensagem para revisão.",snippet:"Resumo curto da mensagem."});
    api.replyEmail=async(request:any)=>{(window as any).__draftEmailReply=request;return{approvalId:"email-approval-1"};};
    (window as any).nexo.resolveApproval=async(id:string,approved:boolean)=>{(window as any).__emailApprovalResolution={id,approved};return{ok:true};};
  });
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  await page.locator(".emailGadgetRow").filter({hasText:"Resumo da semana"}).click();
  const drawer=page.getByRole("dialog",{name:"Resumo da semana"});
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Conteúdo completo da mensagem para revisão.")).toBeVisible();
  await drawer.getByRole("button",{name:/Responder/}).click();
  await drawer.getByRole("textbox",{name:"Sua resposta"}).fill("Obrigado pelo resumo.");
  expect(await page.evaluate(()=>(window as any).__sentEmailReply)).toBeUndefined();
  await drawer.getByRole("button",{name:"Revisar resposta"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__draftEmailReply)).toMatchObject({connectionId:"mail-account",messageId:"mail-1",threadId:"thread-1",bodyText:"Obrigado pelo resumo."});
  expect(await page.evaluate(()=>(window as any).__emailApprovalResolution)).toBeUndefined();
  await drawer.getByRole("button",{name:"Aprovar e enviar resposta"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__emailApprovalResolution)).toEqual({id:"email-approval-1",approved:true});
  await expect(drawer).not.toBeVisible();
});
