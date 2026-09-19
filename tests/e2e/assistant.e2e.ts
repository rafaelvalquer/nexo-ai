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
  const tooltipTokens = await page.locator(".tooltipBubble").evaluate((element) => {
    const styles = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      background: styles.backgroundColor,
      tokenBackground: root.getPropertyValue("--nexo-surface-popover").trim(),
      borderColor: styles.borderTopColor,
      shadow: styles.boxShadow,
    };
  });
  const tokenColors = await page.locator(".tooltipBubble").evaluate((element) => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--nexo-surface-popover)";
    probe.style.borderColor = "var(--nexo-border-strong)";
    probe.style.boxShadow = "var(--nexo-shadow-md)";
    element.append(probe);
    const styles = getComputedStyle(probe);
    const values = { background: styles.backgroundColor, borderColor: styles.borderTopColor, shadow: styles.boxShadow };
    probe.remove();
    return values;
  });
  expect(tooltipTokens.background).toBe(tokenColors.background);
  expect(tooltipTokens.borderColor).toBe(tokenColors.borderColor);
  expect(tooltipTokens.shadow).toBe(tokenColors.shadow);
});

test("o indicador de foco visível usa o token de acessibilidade global",async({page})=>{
  await page.goto(url);
  const navigation = page.getByRole("button",{name:"Assistente",exact:true});
  await navigation.focus();
  const focusColors = await navigation.evaluate((element) => {
    const actual = getComputedStyle(element).outlineColor;
    const probe = document.createElement("span");
    probe.style.outlineColor = "var(--nexo-focus-ring)";
    element.after(probe);
    const token = getComputedStyle(probe).outlineColor;
    probe.remove();
    return { actual, token };
  });
  expect(focusColors.actual).toBe(focusColors.token);
});

test("a Command Palette fecha antes do drawer subjacente e mantém o foco confinado",async({page})=>{
  await page.setViewportSize({width:800,height:700});
  await page.goto(url);
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  const chatsTrigger=page.getByRole("button",{name:"Abrir conversas"});
  await chatsTrigger.click();
  const chatsDrawer=page.getByRole("dialog",{name:"Conversas"});
  await expect(chatsDrawer).toBeVisible();
  await page.keyboard.press("Control+K");
  const palette=page.getByRole("dialog",{name:"Paleta de comandos"});
  await expect(palette).toBeVisible();
  await expect(page.getByRole("combobox",{name:"O que deseja fazer?"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(chatsDrawer).toBeVisible();
  await expect(chatsDrawer.getByRole("button",{name:"Fechar painel"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chatsDrawer).toHaveCount(0);
  await expect(chatsTrigger).toBeFocused({timeout:10_000});
});

test("toast de aviso anuncia o estado e pode ser dispensado por teclado",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{
    const {useToastStore}=await import("/stores/toast.ts");
    useToastStore.getState().show({title:"Aprovação necessária",description:"Revise a ação antes de continuar.",tone:"warning"});
  });
  const toast=page.getByRole("status").filter({hasText:"Aprovação necessária"});
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Revise a ação antes de continuar.");
  const dismiss=toast.getByRole("button",{name:"Dispensar notificação"});
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toast).toHaveCount(0);
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
  const localStatus=page.getByRole("button",{name:"Estado da IA local"});
  await localStatus.click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const localAiPopover=page.locator(".topbarPopover");
  await expect(localAiPopover.getByText("Ollama conectado", { exact: true })).toBeVisible();
  await expect(localAiPopover).toHaveCSS("transform-origin","280px 0px");
  await expect(page.locator(".topbarPopover .popoverLine b")).toHaveText("qwen3:1.7b");
  await page.getByRole("button",{name:"Configurar IA"}).click();
  await expect(page.getByRole("heading",{name:"Configurações"})).toBeVisible();
  await page.setViewportSize({width:700,height:800});
  await localStatus.focus();
  await expect(localStatus.locator("span").nth(1)).toBeHidden();
  await expect(page.getByRole("tooltip")).toHaveText("Ollama conectado · clique para ver o modelo e as configurações");
  await expect(localStatus).toHaveAccessibleName("Estado da IA local");
});

test("a execução ativa mostra timeline operacional e tool chips no chat e no drawer",async({page},testInfo)=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo;const task={id:"ui-running-task",runId:"ui-running-run",type:"assistant-chat",status:"running",input:{text:"resuma um arquivo"},conversationId:"preview-1",createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),statusMessage:"Analisando a solicitação…",statusHistory:["Entendendo a solicitação","Localizando arquivos"]};api.onVisualEvent=(listener:(event:any)=>void)=>{api.__visualListener=listener;return()=>{delete api.__visualListener;};};api.listActiveTasks=async()=>[];api.startChatTask=async()=>{api.listActiveTasks=async()=>[task];return task;};});
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({timeout:15_000});
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
  await page.keyboard.press("Escape");
  await expect(executionDrawer).not.toBeVisible();
  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator(".assistantHeader").getByRole("button",{name:"Execução"})).toBeVisible();
  await expect(page.getByRole("complementary",{name:"Execução ativa"})).toBeHidden();
  await page.setViewportSize({width:1600,height:900});
  const wideExecution=page.getByRole("complementary",{name:"Execução ativa"});
  await expect(wideExecution).toBeVisible();
  await expect(page.locator(".assistantHeader").getByRole("button",{name:"Execução"})).toBeHidden();
  const panelBounds=await page.evaluate(()=>({conversation:document.querySelector(".assistantSessionPanel")!.getBoundingClientRect().toJSON(),execution:document.querySelector(".wideExecutionRail")!.getBoundingClientRect().toJSON()}));
  expect(panelBounds.execution.left).toBeGreaterThanOrEqual(panelBounds.conversation.right);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
    const composerBounds=await page.evaluate(()=>{const viewport={width:innerWidth,height:innerHeight};const rect=(element:Element)=>{const box=element.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom};};return{viewport,dock:rect(document.querySelector(".composerDock")!),controls:[...document.querySelectorAll(".composerToolbar button")].map(rect),search:rect(document.querySelector(".topbarSearch")!)};});
    expect(composerBounds.dock.left,`composer clipped on left at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
    expect(composerBounds.dock.right,`composer clipped on right at ${viewport.width}px`).toBeLessThanOrEqual(composerBounds.viewport.width+1);
    expect(composerBounds.dock.top,`composer clipped above viewport at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
    expect(composerBounds.dock.bottom,`composer overlaps viewport bottom at ${viewport.width}px`).toBeLessThanOrEqual(composerBounds.viewport.height+1);
    expect(composerBounds.controls.length,`composer action controls missing at ${viewport.width}px`).toBeGreaterThanOrEqual(2);
    for(const control of composerBounds.controls){expect(control.left,`composer action clipped left at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);expect(control.right,`composer action clipped right at ${viewport.width}px`).toBeLessThanOrEqual(composerBounds.viewport.width+1);expect(control.bottom,`composer action clipped below at ${viewport.width}px`).toBeLessThanOrEqual(composerBounds.viewport.height+1);}
    expect(composerBounds.search.left,`command search clipped left at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
    expect(composerBounds.search.right,`command search clipped right at ${viewport.width}px`).toBeLessThanOrEqual(composerBounds.viewport.width+1);
    if(viewport.width<=800){const trigger=page.getByRole("button",{name:"Abrir conversas"});await trigger.click();const drawer=page.getByRole("dialog",{name:"Conversas"});await expect(drawer).toBeVisible();await expect(drawer.locator(".chatTabsList")).toBeVisible();await expect(drawer.getByRole("button",{name:"Fechar painel"})).toBeVisible();await page.screenshot({path:testInfo.outputPath(`assistant-compact-chat-sheet-${viewport.width}.png`)});await page.keyboard.press("Escape");await expect(drawer).not.toBeVisible();await expect(trigger).toBeFocused();}
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
  // CommandPalette loads persisted recents when the shell is mounted. Reloading
  // here makes the test exercise persisted state instead of mutating storage
  // behind React after initialization.
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/sidebarCollapsed/);
  const paletteTrigger=page.getByRole("button",{name:"Abrir busca e comandos"});
  await paletteTrigger.focus();
  await page.keyboard.press("Control+K");
  const palette=page.getByRole("dialog", { name: "Paleta de comandos" });
  await expect(palette).toBeVisible();
  await expect(page.getByRole("group",{name:"Recentes"}).getByRole("option",{name:/Abrir Escritório/})).toBeVisible();
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

test("chat tabs support arrow/Home/End navigation and keep close action separate",async({page})=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Assistente",exact:true}).click();
  const tablist=page.getByRole("tablist",{name:"Conversas abertas"});
  await expect(tablist.getByRole("tab")).toHaveCount(1);
  await page.getByRole("button",{name:"Novo chat"}).click();
  await expect(tablist.getByRole("tab")).toHaveCount(2);
  const tabs=tablist.getByRole("tab");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected","true");
  await tabs.nth(1).press("ArrowUp");
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected","true");
  await tabs.nth(0).press("End");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected","true");
  const closeTab=tablist.getByRole("button",{name:/Fechar/});
  await closeTab.focus();
  await expect(page.getByRole("tooltip")).toHaveText(/Fechar/);
  await page.keyboard.press("Enter");
  await expect(tablist.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tabpanel",{name:"Conversa ativa"})).toBeVisible();
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
  await page.emulateMedia({reducedMotion:"no-preference"});
  const tokens=await page.locator(".assistantPage").evaluate(element=>({fast:getComputedStyle(element).getPropertyValue("--nexo-motion-fast").trim(),spin:getComputedStyle(element).getPropertyValue("--nexo-motion-spin").trim(),stagger:getComputedStyle(element).getPropertyValue("--nexo-motion-delay-stagger").trim()}));
  expect(tokens).toEqual({fast:"140ms",spin:"900ms",stagger:"150ms"});
  const typingDelays=await page.locator(".assistantPage").evaluate(element=>{const probe=document.createElement("div");probe.className="typing";probe.innerHTML="<span></span><span></span><span></span>";element.append(probe);const delays=[...probe.children].map(dot=>getComputedStyle(dot).animationDelay);probe.remove();return delays;});
  expect(typingDelays).toEqual(["0s","0.15s","0.3s"]);
  const sharedMotion=await page.locator(".assistantPage").evaluate(element=>{const progress=document.createElement("div");progress.className="uiProgress indeterminate";progress.innerHTML='<span class="uiProgressTrack"><span class="uiProgressFill"></span></span>';element.append(progress);const fill=progress.querySelector(".uiProgressFill")!;const progressDuration=getComputedStyle(fill).animationDuration;progress.remove();const button=document.createElement("button");button.className="uiButton";element.append(button);const easing=getComputedStyle(button).transitionTimingFunction;button.remove();return{progressDuration,easing,scale:getComputedStyle(element).getPropertyValue("--nexo-scale-pressed").trim()};});
  expect(sharedMotion).toEqual({progressDuration:"1.2s",easing:Array(4).fill("cubic-bezier(0.16, 1, 0.3, 1)").join(", "),scale:".98"});
});

test("a command palette indexes macros and saved conversations by title", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.listMacros=async()=>[{id:"macro-report",name:"Relatório semanal",description:"Compilar planilhas",prompt:""}];
    api.listConversations=async()=>[{id:"conversation-project",title:"Projeto Nexo",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.listRecentDocuments=async()=>[{id:"doc-budget",name:"Orçamento 2026.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",sizeBytes:1200,status:"ready",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    api.runMacro=async(id:string)=>{(window as any).__runMacro=id;return{};};
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

test("command palette presents recent actions separately from semantic command groups",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    localStorage.setItem("nexo.command.recent",JSON.stringify(["Abrir Macros","Nova conversa"]));
    const api=(window as any).nexo;
    api.listMacros=async()=>[];
    api.listConversations=async()=>[];
    api.listRecentDocuments=async()=>[];
  });
  await page.keyboard.press("Control+K");
  const recent=page.getByRole("group",{name:"Recentes"});
  await expect(recent).toBeVisible();
  await expect(recent.getByRole("option",{name:/Abrir Macros/})).toBeVisible();
  await expect(recent.getByRole("option",{name:/Nova conversa/})).toBeVisible();
  const navigation=page.getByRole("group",{name:"Navegação"});
  await expect(navigation.getByRole("option",{name:/Abrir Assistente/})).toBeVisible();
  await expect(page.getByRole("option",{name:/Abrir Macros/})).toHaveCount(1);
  await recent.getByRole("option",{name:/Abrir Macros/}).click();
  await expect(page.getByRole("heading",{name:"Macros",exact:true})).toBeVisible();
});

test("command palette keeps its active option visible and selects it with Enter",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{const api=(window as any).nexo;api.listRecentDocuments=async()=>Array.from({length:30},(_,index)=>({id:`palette-document-${index}`,name:`Documento ${String(index+1).padStart(2,"0")}.txt`,mimeType:"text/plain",sizeBytes:100,status:"ready",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));});
  await page.keyboard.press("Control+K");
  const input=page.getByRole("combobox",{name:"O que deseja fazer?"});
  await expect(input).toBeFocused();
  await input.fill("Documento");
  await expect(page.getByRole("option",{name:/Abrir documento: Documento 30\.txt/})).toBeVisible();
  for(let index=0;index<20;index++)await page.keyboard.press("ArrowDown");
  const activeId=await input.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const active=page.locator(`#${activeId}`);
  await expect(active).toHaveAttribute("role","option");
  await expect(active).toHaveAttribute("aria-selected","true");
  const geometry=await page.evaluate(id=>{const list=document.getElementById("nexo-command-list")!,option=document.getElementById(id)!;const listRect=list.getBoundingClientRect(),optionRect=option.getBoundingClientRect();return{scrollTop:list.scrollTop,inside:optionRect.top>=listRect.top&&optionRect.bottom<=listRect.bottom};},activeId!);
  expect(geometry.scrollTop).toBeGreaterThan(0);
  expect(geometry.inside).toBe(true);
  await expect(input).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog",{name:"Paleta de comandos"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Documentos",exact:true})).toBeVisible();
});

test("a palette expõe todas as rotas e mostra erro de comando como toast",async({page},testInfo)=>{
  await page.goto(url);
  await page.evaluate(()=>{(window as any).nexo.runMacro=async()=>{throw new Error("Macro indisponível");};(window as any).nexo.listMacros=async()=>[{id:"macro-fail",name:"Macro indisponível",description:"",prompt:""}];});
  await page.keyboard.press("Control+K");
  for(const label of ["Ferramentas","Conexões"]) {
    await page.getByPlaceholder("O que deseja fazer?").fill(label.toLowerCase());
    await page.getByRole("option",{name:new RegExp(`Abrir ${label}`)}).click();
    await expect(page.getByRole("heading",{name:label,exact:true})).toBeVisible();
    await page.keyboard.press("Control+K");
  }
  for(const label of ["Memória","Diagnóstico"]) {
    await page.getByPlaceholder("O que deseja fazer?").fill(label.toLowerCase());
    await expect(page.getByRole("option",{name:new RegExp(`Abrir ${label}`)})).toBeVisible();
  }
  await page.getByPlaceholder("O que deseja fazer?").fill("Macro indisponível");
  await page.getByRole("option",{name:/Executar macro: Macro indisponível/}).click();
  await expect(page.getByRole("alert").getByText("Macro indisponível")).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Paleta de comandos"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("command-palette-error-toast.png")});
  await page.keyboard.press("Escape");
  await page.locator(".sidebar").getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Catálogo",exact:true}).click();
  await expect(page.getByText("Catálogo de ferramentas",{exact:true})).toBeVisible();
  await page.keyboard.press("Control+K");
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
    api.listMacros=async()=>[{id:"macro-mention",name:"Relatório diário",description:"Compila o resumo diário",prompt:"",trigger:{type:"manual"},actions:[],output:{type:"notification"},policy:{},consecutiveFailures:0,status:"paused",enabled:false}];
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
  await page.getByRole("option",{name:/Relatorio\.pdf/}).click();
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

test("composer accepts dropped documents and sends their indexed document IDs with the prompt",async({page})=>{
  await page.goto(url);
  await page.evaluate(()=>{
    const api=(window as any).nexo;
    api.importDroppedDocument=async(file:File)=>{(window as any).__droppedFileName=file.name;return{id:"drop-task",type:"document-import",status:"running",input:{source:"trusted-picker"},createdAt:new Date().toISOString()};};
    api.getTask=async(id:string)=>({id,status:"completed",result:{id:"document-dropped",name:"relatorio.txt",mimeType:"text/plain",sizeBytes:8,status:"ready",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
    api.startChatTask=async(conversationId:string,text:string,documentIds:string[])=>{(window as any).__dropSubmission={conversationId,text,documentIds};return{id:"drop-chat-task",type:"assistant-chat",status:"running",input:{text},conversationId,createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),statusMessage:"Executando…",statusHistory:["Executando…"]};};
  });
  await page.getByRole("button",{name:"Assistente",exact:true}).click();
  const composer=page.locator(".composer");
  await expect(composer).toBeVisible({timeout:15_000});
  await page.evaluate(()=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File(["conteúdo"],"relatorio.txt",{type:"text/plain"}));
    const target=document.querySelector(".composer")!;
    target.dispatchEvent(new DragEvent("dragenter",{bubbles:true,dataTransfer:transfer}));
    target.dispatchEvent(new DragEvent("dragover",{bubbles:true,dataTransfer:transfer}));
    window.setTimeout(()=>target.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer})),30);
  });
  await expect(page.getByRole("status").filter({hasText:"Solte para anexar"})).toBeVisible();
  await expect(page.locator(".attachmentItem.ready")).toContainText("relatorio.txt");
  await expect.poll(()=>page.evaluate(()=>(window as any).__droppedFileName)).toBe("relatorio.txt");
  await page.getByRole("textbox",{name:"Mensagem para o Nexo"}).fill("Resuma o anexo");
  await page.getByRole("button",{name:"Enviar mensagem"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__dropSubmission)).toMatchObject({text:"Resuma o anexo",documentIds:["document-dropped"]});
  await expect(composer).toBeVisible();
});
