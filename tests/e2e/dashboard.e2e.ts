import path from "node:path";
import {expect,test} from "@playwright/test";
import {createServer,type ViteDevServer} from "vite";

let server:ViteDevServer;let url:string;
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Prévia indisponível");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("Dashboard mantém a mesma topologia cerebral em reduced motion",async({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  let neuralSceneRequested=false;
  page.on("request",request=>{if(request.url().includes("/components/ai/neural/NeuralScene.tsx"))neuralSceneRequested=true;});
  await page.goto(url);await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const palette=await page.locator(".dashboardPage").evaluate(node=>({violet:getComputedStyle(node).getPropertyValue("--dash-violet").trim(),token:getComputedStyle(document.documentElement).getPropertyValue("--nexo-violet").trim(),hero:getComputedStyle(document.querySelector(".dashboardHero")!).backgroundImage}));
  expect(palette.violet).toBe(palette.token);expect(palette.hero).toContain("radial-gradient");
  await expect(page.getByText("NEXO CORE",{exact:false}).first()).toBeVisible();
  await expect(page.locator(".neuralCoreStaticFrame")).toBeVisible();
  await expect(page.locator(".nucleusCanvas")).toHaveCount(0);
  expect(neuralSceneRequested).toBe(false);
  const core=page.locator(".nexoNeuralCore");
  await expect(core).toHaveAttribute("data-visual","brain-network");
  await expect(core).toHaveAttribute("data-topology-version","brain-v1");
  await expect(page.locator(".neuralCoreStaticFrame")).toHaveAttribute("data-topology-version","brain-v1");
  await page.locator(".neuralCoreStaticFrame svg").screenshot({path:testInfo.outputPath("neural-core-brain-reduced.png"),animations:"disabled"});
  await expect(core).toHaveCSS("--nucleus-core","#765cff");
  await page.evaluate(async()=>{const {useVisualStore}=await import("/stores/visual.ts");useVisualStore.getState().set("success");});
  await expect(core).toHaveCSS("--nucleus-core","#3bd89f");await expect(core).toHaveCSS("--nucleus-ring","#8cfdca");
  await page.evaluate(async()=>{const {useVisualStore}=await import("/stores/visual.ts");useVisualStore.getState().set("idle");});
  await page.getByRole("button",{name:"Explorar núcleo do Nexo",exact:true}).click();await expect(page.locator(".nucleusSatellites button")).toHaveCount(5);
  for(const className of ["satelliteAssistant","satelliteDocuments","satelliteOffice","satelliteMacros","satelliteSettings"])await expect(page.locator(`.${className}`)).toHaveCount(1);
});

test("Dashboard mantém o Neural Core WebGL ativo em idle quando suportado",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const webglSupported=await page.evaluate(()=>{
    const canvas=document.createElement("canvas");
    return Boolean(canvas.getContext("webgl"));
  });
  test.skip(!webglSupported,"WebGL indisponível no runner");
  await page.evaluate(async()=>{const {useVisualStore}=await import("/stores/visual.ts");useVisualStore.getState().set("idle");});
  const core=page.locator(".nexoNeuralCore");
  await expect(core).toHaveAttribute("data-webgl","ready",{timeout:10_000});
  await expect(core).toHaveAttribute("data-state","idle");
  await expect(core).toHaveAttribute("data-visual","brain-network");
  await expect(core).toHaveAttribute("data-topology-version","brain-v1");
  await expect(page.locator(".nucleusCanvas")).toBeVisible();
  await expect(page.locator(".neuralCoreVisualStack")).toHaveClass(/isSceneReady/);
  await expect(page.locator(".neuralCoreStaticFrame")).toHaveAttribute("data-topology-version","brain-v1");
});

test("Dashboard usa a mesma topologia quando WebGL está indisponível",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){
      if(type==="webgl"||type==="experimental-webgl")return null;
      return (original as any).call(this,type,...args);
    } as any;
  });
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const core=page.locator(".nexoNeuralCore");
  await expect(core).toHaveAttribute("data-webgl","unavailable");
  await expect(core).toHaveAttribute("data-visual","brain-network");
  await expect(core).toHaveAttribute("data-topology-version","brain-v1");
  await expect(page.locator(".neuralFallback")).toBeVisible();
  await expect(page.locator(".neuralFallback")).toHaveAttribute("data-topology-version","brain-v1");
  await expect(page.locator(".nucleusCanvas")).toHaveCount(0);
});

test("a troca para uma rota lazy mostra skeleton contextual e acessível",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  let releaseChunk!:()=>void;
  let markChunkRequested!:()=>void;
  const chunkGate=new Promise<void>(resolve=>{releaseChunk=resolve;});
  const chunkRequested=new Promise<void>(resolve=>{markChunkRequested=resolve;});
  await page.route("**/pages/Automations.tsx*",async route=>{markChunkRequested();await chunkGate;await route.continue();});
  try{
    await page.goto(url);
    await page.locator(".sidebar").getByRole("button",{name:"Macros",exact:true}).click();
    await chunkRequested;
    const loading=page.getByRole("status",{name:"Carregando Macros"});
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy","true");
    const skeletons=page.locator(".routeLoadingMacroGrid .routeLoadingMacroCard");
    await expect(skeletons).toHaveCount(3);
    await expect.poll(()=>skeletons.first().evaluate(element=>getComputedStyle(element).animationName)).toBe("none");
  }finally{releaseChunk();}
  await expect(page.getByRole("heading",{name:"Macros",exact:true})).toBeVisible();
});

test("dashboard refresh tooltip appears on keyboard focus and hover",async({page})=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const refresh=page.getByRole("button",{name:"Atualizar dashboard"});
  await refresh.focus();
  await expect(page.getByRole("tooltip").getByText("Atualizar dashboard")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await refresh.hover();
  await expect(page.getByRole("tooltip").getByText("Atualizar dashboard")).toBeVisible();
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

test("gadget mantém o último dado durante refresh e oculta detalhes técnicos fora do modo desenvolvedor",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{
    const api=(window as any).nexo.dashboard;
    api.getLayout=async()=>[{instanceId:"stale-task-card",gadgetId:"tasks",enabled:true,size:"M",position:0,configuration:{}}];
    api.getGadgetData=async()=>({data:[{id:"task-preserved",title:"Tarefa preservada",status:"running"}],fetchedAt:new Date().toISOString(),stale:false});
    api.refreshGadget=async()=>new Promise((_resolve,reject)=>{(window as any).__failGadgetRefresh=()=>reject(new Error("SQLITE_BUSY: private database detail"));});
    const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setStatus({settings:{developerDiagnosticsEnabled:false}});
  });
  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const gadget=page.locator(".gadgetCard").filter({hasText:"Tarefa preservada"});
  await expect(gadget).toBeVisible();
  await gadget.getByRole("button",{name:"Atualizar Tarefas em andamento"}).click();
  await expect(gadget.getByText("Atualizando dados…")).toBeVisible();
  await expect(gadget.getByText("Tarefa preservada")).toBeVisible();
  await page.evaluate(()=>{(window as any).__failGadgetRefresh();});
  await expect(gadget.getByText("Exibindo último dado salvo")).toBeVisible();
  await expect(gadget.getByText("Tarefa preservada")).toBeVisible();
  await expect(gadget).not.toContainText("SQLITE_BUSY");
  await page.evaluate(async()=>{const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setStatus({settings:{developerDiagnosticsEnabled:true}});});
  await gadget.getByRole("button",{name:"Atualizar Tarefas em andamento"}).click();
  await page.evaluate(()=>{(window as any).__failGadgetRefresh();});
  await expect(gadget).toContainText("SQLITE_BUSY: private database detail");
});

test("falha inicial do dashboard oferece retry e só vira estado vazio após recuperação",async({page})=>{
  await page.goto(url);
  await page.evaluate(async()=>{
    const api=(window as any).nexo.dashboard;
    api.getLayout=async()=>{throw new Error("SQLITE_BUSY: private dashboard detail");};
    const {useDashboardStore}=await import("/stores/dashboard.ts");
    useDashboardStore.setState({layout:[],data:{},loading:false,error:undefined});
    const {useAppStore}=await import("/stores/app.ts");useAppStore.getState().setStatus({settings:{developerDiagnosticsEnabled:false}});
  });
  await page.getByRole("button",{name:"Atualizar dashboard"}).click();
  const failure=page.getByRole("alert");
  await expect(failure).toContainText("Não foi possível carregar o dashboard");
  await expect(failure).toContainText("Tente novamente para carregar suas informações.");
  await expect(failure).not.toContainText("SQLITE_BUSY");
  await page.evaluate(()=>{(window as any).nexo.dashboard.getLayout=async()=>[];});
  await failure.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByRole("heading",{name:"Monte um dashboard que seja seu"})).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("catálogo de gadgets usa NexoDrawer e restaura foco ao fechar com Escape",async({page},testInfo)=>{
  await page.goto(url);await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  const opener=page.locator(".dashboardAddButton");await opener.click();
  const drawer=page.getByRole("dialog",{name:"Adicionar gadget"});await expect(drawer).toBeVisible();
  const firstFocusable=drawer.locator("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])").first();
  const lastFocusable=drawer.locator("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])").last();
  await expect(firstFocusable).toHaveAccessibleName("Fechar painel");
  await expect(firstFocusable).toBeFocused();
  await page.screenshot({path:testInfo.outputPath("dashboard-gadget-drawer.png")});
  await page.keyboard.press("Shift+Tab");await expect(lastFocusable).toBeFocused();
  await page.keyboard.press("Tab");await expect(firstFocusable).toBeFocused();
  await page.locator("#page-content").evaluate(element=>(element as HTMLElement).focus());
  await page.keyboard.press("Tab");await expect(firstFocusable).toBeFocused();
  await page.keyboard.press("Escape");await expect(drawer).not.toBeVisible();await expect(opener).toBeFocused();
});

test("catálogo lazy anuncia e mostra skeleton enquanto carrega",async({page})=>{
  let releaseChunk!:()=>void;
  let markChunkRequested!:()=>void;
  const chunkGate=new Promise<void>(resolve=>{releaseChunk=resolve;});
  const chunkRequested=new Promise<void>(resolve=>{markChunkRequested=resolve;});
  await page.route("**/components/dashboard/GadgetCatalog.tsx*",async route=>{markChunkRequested();await chunkGate;await route.continue();});
  try{
    await page.goto(url);
    await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
    await page.locator(".dashboardAddButton").click();
    await chunkRequested;
    const loading=page.getByRole("status",{name:"Carregando catálogo de gadgets"});
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy","true");
    await expect(page.getByRole("dialog",{name:"Adicionar gadget"})).toBeVisible();
    await expect(page.locator(".dashboardCatalogLoadingRow")).toHaveCount(5);
  }finally{releaseChunk();}
  await expect(page.getByRole("dialog",{name:"Adicionar gadget"})).toBeVisible();
  await expect(page.locator(".gadgetCatalog")).toBeVisible();
  await expect(page.locator(".dashboardCatalogLoading")).toHaveCount(0);
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
    api.getGadgetData=async()=>({data:{available:true,connectionId:"mail-account",provider:"google",canModify:true,unreadCount:1,messages:[{id:"mail-1",threadId:"thread-1",from:{name:"Equipe Nexo",email:"team@example.com"},subject:"Resumo da semana",snippet:"Resumo curto da mensagem.",receivedAt:"2026-09-17T12:00:00.000Z",isUnread:true,hasAttachments:false}]},fetchedAt:new Date().toISOString(),stale:false});
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


test("email gadget moves a message to trash only after approval and refreshes the gadget",async({page})=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Assistente",exact:true}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({timeout:15000});
  await page.evaluate(()=>{
    const api=(window as any).nexo.dashboard;
    const message={id:"trash-mail-1",threadId:"trash-thread-1",from:{name:"Equipe Nexo",email:"team@example.com"},subject:"Mensagem para excluir",snippet:"Conteúdo que será movido.",receivedAt:"2026-09-20T12:00:00.000Z",isUnread:true,hasAttachments:false};
    api.getLayout=async()=>[{instanceId:"mail-trash-home",gadgetId:"email",enabled:true,size:"M",position:0,configuration:{}}];
    api.getGadgetData=async()=>({data:{available:true,connectionId:"mail-account",provider:"google",canModify:true,unreadCount:1,messages:[message]},fetchedAt:new Date().toISOString(),stale:false});
    api.refreshGadget=async()=>({data:{available:true,connectionId:"mail-account",provider:"google",canModify:true,unreadCount:0,messages:[]},fetchedAt:new Date().toISOString(),stale:false});
    api.getEmailMessage=async()=>({...message,bodyText:"Conteúdo completo da mensagem."});
    api.trashEmail=async(request:any)=>{(window as any).__trashEmailRequest=request;return{approvalId:"trash-approval-1"};};
    (window as any).nexo.resolveApproval=async(id:string,approved:boolean)=>{(window as any).__trashApprovalResolution={id,approved};return{ok:true};};
  });

  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  await page.locator(".emailGadgetRow").filter({hasText:"Mensagem para excluir"}).click();
  const drawer=page.getByRole("dialog",{name:"Mensagem para excluir"});
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button",{name:/Excluir/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__trashEmailRequest)).toEqual({connectionId:"mail-account",messageId:"trash-mail-1"});
  await expect(drawer.getByText("Este e-mail será movido para a lixeira da sua conta.")).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__trashApprovalResolution)).toBeUndefined();
  await drawer.getByRole("button",{name:/Mover para a lixeira/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__trashApprovalResolution)).toEqual({id:"trash-approval-1",approved:true});
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(".emailGadgetRow").filter({hasText:"Mensagem para excluir"})).toHaveCount(0);
});

test("email gadget disables trash when email.modify is unavailable",async({page})=>{
  await page.goto(url);
  await page.locator(".sidebar").getByRole("button",{name:"Assistente",exact:true}).click();
  await expect(page.locator(".assistantPage")).toBeVisible({timeout:15000});
  await page.evaluate(()=>{
    const api=(window as any).nexo.dashboard;
    const message={id:"read-only-mail",from:{email:"sender@example.com"},subject:"Conta somente leitura",snippet:"Sem permissão de alteração.",receivedAt:"2026-09-20T12:00:00.000Z",isUnread:false,hasAttachments:false};
    api.getLayout=async()=>[{instanceId:"mail-read-only",gadgetId:"email",enabled:true,size:"M",position:0,configuration:{}}];
    api.getGadgetData=async()=>({data:{available:true,connectionId:"read-only-account",provider:"google",canModify:false,unreadCount:0,messages:[message]},fetchedAt:new Date().toISOString(),stale:false});
    api.getEmailMessage=async()=>({...message,bodyText:"Mensagem somente leitura."});
  });

  await page.locator(".sidebar").getByRole("button",{name:"Dashboard",exact:true}).click();
  await page.locator(".emailGadgetRow").filter({hasText:"Conta somente leitura"}).click();
  const drawer=page.getByRole("dialog",{name:"Conta somente leitura"});
  const trash=drawer.getByRole("button",{name:/Excluir/});
  await expect(trash).toBeDisabled();
  await expect(trash).toHaveAttribute("title","Ative a permissão Alterar e-mails nas conexões.");
});
