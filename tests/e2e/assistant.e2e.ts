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

const primaryNavigation = ["Dashboard", "Assistente", "Macros", "Escritório", "Configurações"];
test("atalho de teclado pula a navegação e leva o foco ao conteúdo principal",async({page})=>{
  await page.goto(url);
  const skipLink=page.getByRole("link",{name:"Pular para o conteúdo da página"});
  await expect.poll(()=>skipLink.evaluate(element=>element.getBoundingClientRect().bottom)).toBeLessThan(0);
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#page-content")).toBeFocused();
});

test("tooltips do shell aparecem ao focar e fecham com Escape sem remover o nome acessível",async({page})=>{
  await page.goto(url);
  const notifications=page.getByRole("button",{name:"Notificações"});
  await notifications.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Notificações");
  await expect(notifications).toHaveAttribute("aria-describedby",/.+/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(notifications).toHaveAccessibleName("Notificações");
  const collapse=page.getByRole("button",{name:"Recolher menu"});
  await collapse.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Recolher menu");
});

test("menu principal apresenta as áreas principais do produto", async ({ page }, testInfo) => {
  await page.goto(url);
  await page.getByRole("button", { name: "Assistente", exact: true }).click();
  await expect(page.locator(".assistantPage")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({path:testInfo.outputPath("assistant-empty.png")});
  for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(page.locator(".sidebar nav button")).toHaveCount(primaryNavigation.length);
  await expect(page.locator('.sidebar nav button[aria-current="page"] .navActiveIndicator')).toHaveCount(1);
  await page.getByRole("button", { name: "Macros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Macros", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.sidebar nav button[aria-current="page"] .navActiveIndicator')).toHaveCount(1);
});

test("status da IA oferece um caminho direto para Configurações",async({page})=>{
  await page.goto(url);
  await page.getByRole("button",{name:"Estado da IA local"}).click();
  await expect(page.locator(".topbarPopover").getByText("Ollama conectado", { exact: true })).toBeVisible();
  await expect(page.locator(".topbarPopover .popoverLine b")).toHaveText("qwen3:1.7b");
  await page.getByRole("button",{name:"Configurar IA"}).click();
  await expect(page.getByRole("heading",{name:"Configurações"})).toBeVisible();
});

test("a execução ativa mostra timeline operacional e tool chips no chat e no drawer",async({page},testInfo)=>{
  await page.goto(url);
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  await page.evaluate(()=>{const api=(window as any).nexo;const task={id:"ui-running-task",runId:"ui-running-run",type:"assistant-chat",status:"running",input:{text:"resuma um arquivo"},conversationId:"preview-1",createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),statusMessage:"Analisando a solicitação…",statusHistory:["Entendendo a solicitação","Localizando arquivos"]};api.onVisualEvent=(listener:(event:any)=>void)=>{api.__visualListener=listener;return()=>{delete api.__visualListener;};};api.listActiveTasks=async()=>[];api.startChatTask=async()=>{api.listActiveTasks=async()=>[task];return task;};});
  await page.getByRole("textbox",{name:"Mensagem para o Nexo"}).fill("resuma um arquivo");
  await page.getByRole("button",{name:"Enviar mensagem"}).click();
  const executions=page.getByRole("button",{name:"1 execução ativa"});
  await expect(executions).toBeVisible();
  const liveSummary=page.locator(".streaming .executionSummary");
  await expect(liveSummary).toHaveClass(/isActive/);
  await expect(liveSummary.locator('li[aria-current="step"]')).toBeVisible();
  const chips=page.getByRole("list",{name:"Ferramentas usadas nesta execução"});
  await page.evaluate(()=>{(window as any).nexo.__visualListener({eventId:"tool-started-1",runId:"ui-running-run",agentId:"agent-1",conversationId:"preview-1",timestamp:new Date().toISOString(),type:"tool.started",state:"walking",label:"Localizando arquivos",toolName:"filesystem.search",stationId:"document-station",severity:"info"});});
  await expect(chips.getByText("Arquivos",{exact:true})).toBeVisible();
  await expect(chips.getByText("Localizando arquivos")).toBeVisible();
  await page.evaluate(()=>{(window as any).nexo.__visualListener({eventId:"tool-completed-1",runId:"ui-running-run",agentId:"agent-1",conversationId:"preview-1",timestamp:new Date(Date.now()+1).toISOString(),type:"tool.completed",state:"success",label:"Etapa concluída",toolName:"filesystem.search",stationId:"document-station",severity:"success"});});
  await expect(chips.getByText("Etapa concluída")).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("assistant-running.png")});
  await page.locator(".assistantHeader").getByRole("button",{name:"Execução"}).click();
  const executionDrawer=page.getByRole("dialog",{name:"Etapas"});
  await expect(executionDrawer.locator(".executionSummary")).toHaveClass(/isActive/);
  await expect(executionDrawer.locator('li[aria-current="step"]')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("assistant-running-drawer.png")});
  await page.evaluate(async()=>{const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setPage("Dashboard");});
  await page.evaluate(async()=>{const {useAssistantStore}=await import("/stores/assistant.ts");await useAssistantStore.getState().syncSession("preview-1");});
  await page.evaluate(async()=>{const {useNotificationsStore}=await import("/stores/notifications.ts");useNotificationsStore.getState().push({title:"Notificação de teste",detail:"Ainda não lida",tone:"info"});});
  const unreadBadge=page.getByRole("button",{name:"1 notificação não lida"});
  await expect(unreadBadge).toBeVisible();
  await page.getByRole("button",{name:"1 execução ativa"}).click();
  const notifications=page.getByRole("dialog",{name:"Notificações"});
  await expect(unreadBadge).toBeVisible();
  const activeNotification=notifications.getByRole("button",{name:/Abrir tarefa: resuma um arquivo/});
  await expect(activeNotification).toBeVisible();
  await expect(activeNotification).toContainText("resuma um arquivo");
  await page.waitForTimeout(420);
  await page.screenshot({path:testInfo.outputPath("notification-center-drawer.png")});
  await expect(notifications.getByText("Notificação de teste")).toBeVisible();
  await notifications.getByRole("button",{name:/Abrir tarefa: resuma um arquivo/}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox",{name:"Mensagem para o Nexo"})).toBeVisible();
});

test("navegação mantém controles visíveis e sem overflow nos breakpoints do produto", async ({ page }, testInfo) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(url);
  await page.getByRole("button", { name: "Assistente", exact: true }).click();
  await expect(page.locator(".assistantPage")).toBeVisible({ timeout: 15_000 });
  for (const viewport of [{width:760,height:700},{width:800,height:700},{width:900,height:760},{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080}]) {
    await page.setViewportSize(viewport);
    for (const label of primaryNavigation) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    if(viewport.width>720&&viewport.width<=1050) await expect(page.locator(".sidebar .brandMark")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${viewport.width}px`).toBe(true);
    if(viewport.width<=800){await page.getByRole("button",{name:"Abrir conversas"}).click();const drawer=page.getByRole("dialog",{name:"Conversas"});await expect(drawer).toBeVisible();await expect(drawer.locator(".chatTabsList")).toBeVisible();await page.screenshot({path:testInfo.outputPath(`assistant-compact-chat-sheet-${viewport.width}.png`)});await drawer.getByRole("button",{name:"Fechar painel"}).click();await expect(drawer).not.toBeVisible();}
    await page.screenshot({path:testInfo.outputPath(`responsive-${viewport.width}.png`)});
  }
});

test("sidebar recolhida persiste e a paleta abre por atalho", async ({ page },testInfo) => {
  await page.goto(url);
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  await page.evaluate(() => localStorage.setItem("nexo.command.recent", JSON.stringify(["Abrir Escritório"])));
  const paletteTrigger=page.getByRole("button",{name:"Abrir busca e comandos"});
  await paletteTrigger.focus();
  await page.keyboard.press("Control+K");
  const palette=page.getByRole("dialog", { name: "Paleta de comandos" });
  await expect(palette).toBeVisible();
  await expect(page.getByRole("option",{name:/Abrir Escritório.*Recente/})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).not.toBeVisible();
  await expect(paletteTrigger).toBeFocused();
  await page.keyboard.press("Control+K");
  await expect(palette).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("command-palette.png")});
  await page.getByPlaceholder("O que deseja fazer?").fill("escritório");
  await expect(page.getByRole("option", { name: /Abrir Escritório/ })).toBeVisible();
  await page.getByRole("option", { name: /Abrir Escritório/ }).click();
  expect(await page.evaluate(() => localStorage.getItem("nexo.command.recent"))).toContain("Abrir Escritório");
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("option", { name: /Abrir Escritório.*Recente/ })).toBeVisible();
});

test("navigation icon rail exposes the hovered and keyboard-focused label",async({page})=>{
  await page.setViewportSize({width:800,height:700});
  await page.goto(url);
  const dashboard=page.locator(".sidebar nav button").first();
  await dashboard.hover();
  await expect.poll(()=>dashboard.evaluate(element=>getComputedStyle(element,"::after").content)).toContain("Dashboard");
  await dashboard.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".sidebar nav button:focus-visible")).toHaveAttribute("aria-label","Dashboard");
  await expect.poll(()=>dashboard.evaluate(element=>getComputedStyle(element,"::after").content)).toContain("Dashboard");
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole("button",{name:"Recolher menu"}).click();
  await page.keyboard.press("Tab");
  await expect(page.locator(".sidebar nav button:focus-visible")).toHaveAttribute("aria-label","Dashboard");
  await expect.poll(()=>dashboard.evaluate(element=>getComputedStyle(element,"::after").content)).toContain("Dashboard");
});

test("reduced motion neutralizes animations and shared controls use design tokens",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:800,height:700});
  await page.goto(url);
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({timeout:15000});
  const duration=await page.locator(".composer").evaluate(element=>getComputedStyle(element).transitionDuration);
  expect(duration.split(",").every(value=>parseFloat(value)<=0.001)).toBe(true);
  await page.getByRole("button",{name:"Abrir conversas"}).click();
  const drawer=page.getByRole("dialog",{name:"Conversas"});
  await expect(drawer).toBeVisible();
  const drawerMotion=await drawer.evaluate(element=>getComputedStyle(element).transitionDuration);
  expect(drawerMotion.split(",").every(value=>parseFloat(value)<=0.001)).toBe(true);
  await page.keyboard.press("Escape");
  const tokens=await page.locator(".assistantPage").evaluate(element=>({fast:getComputedStyle(element).getPropertyValue("--nexo-motion-fast").trim(),spin:getComputedStyle(element).getPropertyValue("--nexo-motion-spin").trim()}));
  expect(tokens).toEqual({fast:"140ms",spin:"900ms"});
});

test("a command palette indexes macros and saved conversations by title", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.listAutomations=async()=>[{id:"macro-report",name:"Relatório semanal",description:"Compilar planilhas",prompt:""}];
    api.listConversations=async()=>[{id:"conversation-project",title:"Projeto Nexo",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.listRecentDocuments=async()=>[{id:"doc-budget",name:"Orçamento 2026.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",sizeBytes:1200,status:"ready",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.runAutomation=async(id:string)=>{(window as any).__runMacro=id;return{};};
  });
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("O que deseja fazer?").fill("relatório semanal");
  await expect(page.getByRole("option",{name:/Executar macro: Relatório semanal/})).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("projeto nexo");
  await expect(page.getByRole("option",{name:/Abrir conversa: Projeto Nexo/})).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("orçamento 2026");
  await expect(page.getByRole("option",{name:/Abrir documento: Orçamento 2026.xlsx/})).toBeVisible();
  await page.getByPlaceholder("O que deseja fazer?").fill("projeto nexo");
  await page.getByRole("option",{name:/Abrir conversa: Projeto Nexo/}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({ timeout: 15_000 });
});

test("a palette expõe todas as rotas e mostra erro de comando como toast",async({page},testInfo)=>{
  await page.goto(url);
  await page.evaluate(()=>{(window as any).nexo.runAutomation=async()=>{throw new Error("Macro indisponível");};(window as any).nexo.listAutomations=async()=>[{id:"macro-fail",name:"Macro indisponível",description:"",prompt:""}];});
  await page.keyboard.press("Control+K");
  for(const label of ["Ferramentas","Memória","Diagnóstico"]) {
    await page.getByPlaceholder("O que deseja fazer?").fill(label.toLowerCase());
    await expect(page.getByRole("option",{name:new RegExp(`Abrir ${label}`)})).toBeVisible();
  }
  await page.getByPlaceholder("O que deseja fazer?").fill("Macro indisponível");
  await page.getByRole("option",{name:/Executar macro: Macro indisponível/}).click();
  await expect(page.getByRole("alert").getByText("Macro indisponível")).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Paleta de comandos"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("command-palette-error-toast.png")});
});

test("erros técnicos de comandos só aparecem quando o modo desenvolvedor está ativo",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{const api=(window as any).nexo,current=await api.getSettings();current.developerDiagnosticsEnabled=false;api.getSettings=async()=>current;api.updateSettings=async()=>{throw new Error("Error invoking remote method: ECONNREFUSED 127.0.0.1:11434");};const{useAppStore}=await import("/stores/app.ts");useAppStore.getState().setStatus({settings:current});});
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("O que deseja fazer?").fill("Ativar/desativar modo privado");
  await page.getByRole("option",{name:/Ativar\/desativar modo privado/}).click();
  const toast=page.getByRole("alert").filter({hasText:"O comando não pôde ser concluído."});
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText("ECONNREFUSED");
  await toast.getByRole("button",{name:"Dispensar notificação"}).click();
  await page.evaluate(async()=>{const api=(window as any).nexo,current=await api.getSettings();current.developerDiagnosticsEnabled=true;const{useAppStore}=await import("/stores/app.ts");useAppStore.getState().setStatus({settings:current});});
  await page.getByPlaceholder("O que deseja fazer?").fill("Ativar/desativar modo privado");
  await page.getByRole("option",{name:/Ativar\/desativar modo privado/}).click();
  await expect(page.getByRole("alert").filter({hasText:"ECONNREFUSED 127.0.0.1:11434"})).toBeVisible();
});

test("composer resolves folder, imported-document and macro mentions as actionable context",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{
    const api=(window as any).nexo,settings=await api.getSettings();
    api.getSettings=async()=>({...settings,allowedRoots:["C:\\Projetos\\Projeto Nexo"]});
    api.listRecentDocuments=async()=>[{id:"document-mention",name:"Relatorio.pdf",mimeType:"application/pdf",sizeBytes:4,status:"ready",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.listAutomations=async()=>[{id:"macro-mention",name:"Relatório diário",description:"Compila o resumo diário",prompt:"",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0,status:"paused",enabled:false}];
    api.startChatTask=async(conversationId:string,text:string,documentIds:string[])=>{(window as any).__mentionSubmission={conversationId,text,documentIds};return{id:"mention-task",type:"assistant-chat",status:"running",input:{text},conversationId,createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),statusMessage:"Executando…",statusHistory:["Executando…"]};};
  });
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  const composer=page.getByRole("textbox",{name:"Mensagem para o Nexo"});
  await composer.fill("@Projeto");
  await expect(page.getByRole("listbox",{name:"Contextos disponíveis"})).toBeVisible();
  await page.getByRole("option",{name:/Projeto Nexo/}).click();
  await composer.press("End");
  await composer.pressSequentially(" Analise @Relatorio");
  await expect(page.getByRole("option",{name:/Relatorio\.pdf/})).toBeVisible();
  await composer.press("ArrowDown");
  await composer.press("Enter");
  await expect(page.locator(".attachmentItem.ready")).toContainText("Relatorio.pdf");
  await composer.press("End");
  await composer.pressSequentially(" e execute @relatorio");
  await expect(page.getByRole("option",{name:/Relatório diário/})).toBeVisible();
  await page.getByRole("option",{name:/Relatório diário/}).click();
  await page.getByRole("button",{name:"Enviar mensagem"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__mentionSubmission)).toMatchObject({
    text:/@pasta:"C:\\Projetos\\Projeto Nexo".*@documento:"Relatorio\.pdf".*@macro:"Relatório diário"/,
    documentIds:["document-mention"]
  });
});
