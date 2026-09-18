import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";
let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});
test.beforeEach(async({page})=>{
  await page.goto(url);await page.getByRole("button",{name:"Assistente",exact:true}).click();
  await page.evaluate(async(modulePath)=>{
    const {useAssistantStore}=await import(modulePath), api=(window as any).nexo;
    const data=Array.from({length:551},(_,i)=>({id:`history-${String(i).padStart(4,"0")}`,conversationId:"preview-1",role:i%2?"assistant":"user",content:`Mensagem histórica ${i}. Conteúdo para verificar a posição de leitura.`,createdAt:new Date(Date.UTC(2026,8,16,12,0,i)).toISOString()}));
    (window as any).__history=data;
    api.conversationMessages=async(id:string)=>id==="preview-1"?structuredClone(data):[];
    await useAssistantStore.getState().sync();
  },"/stores/assistant.ts");
  await expect(page.locator("[data-message-id]")).toHaveCount(50);
  await expect(page.locator('[data-message-id="history-0550"]')).toBeVisible();
  await expect(page.locator('[data-message-id="history-0000"]')).toHaveCount(0);
});
test("paginates without moving the visible message and preserves pages across sync and tabs",async({page})=>{
  const viewport=page.locator(".chatViewport");
  await viewport.evaluate(node=>{node.scrollTop=0;});
  const anchor=page.locator('[data-message-id="history-0501"]');
  const top=await anchor.evaluate(node=>node.getBoundingClientRect().top);
  await page.getByRole("button",{name:"Carregar mensagens anteriores",exact:true}).click();
  await expect(page.locator("[data-message-id]")).toHaveCount(100);
  await expect.poll(async()=>Math.abs((await anchor.evaluate(node=>node.getBoundingClientRect().top))-top)).toBeLessThan(3);
  await expect(page.getByRole("button",{name:"Nova resposta",exact:true})).toHaveCount(0);
  await page.evaluate(async(modulePath)=>{const {useAssistantStore}=await import(modulePath);await useAssistantStore.getState().sync();},"/stores/assistant.ts");
  await expect(page.locator("[data-message-id]")).toHaveCount(100);
  await page.evaluate(async(modulePath)=>{const {useAssistantStore}=await import(modulePath);await useAssistantStore.getState().createSession();},"/stores/assistant.ts");
  await expect(page.locator("[data-message-id]")).toHaveCount(0);
  await page.evaluate(async(modulePath)=>{const {useAssistantStore}=await import(modulePath);useAssistantStore.getState().selectSession("preview-1");},"/stores/assistant.ts");
  await expect(page.locator("[data-message-id]")).toHaveCount(100);
});
test("allows retry and keeps the reader anchored while another response streams",async({page})=>{
  await page.locator(".chatViewport").evaluate(node=>{node.scrollTop=0;});
  await page.evaluate(()=>{const api=(window as any).nexo,read=api.conversationMessagePage;let failed=false;api.conversationMessagePage=async(id:string,options:any)=>{if(options?.before&&!failed){failed=true;throw new Error("Falha temporária de leitura");}return read(id,options);};});
  await page.getByRole("button",{name:"Carregar mensagens anteriores",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Falha temporária");await expect(page.locator("[data-message-id]")).toHaveCount(50);
  await page.getByRole("button",{name:"Tentar carregar mensagens anteriores novamente"}).click();await expect(page.locator("[data-message-id]")).toHaveCount(100);
  const before=await page.locator('[data-message-id="history-0501"]').evaluate(node=>node.getBoundingClientRect().top);
  await page.evaluate(async(modulePath)=>{
    const {useAssistantStore}=await import(modulePath),now=new Date().toISOString();
    const task={id:"stream-task",type:"assistant-chat",status:"running",conversationId:"preview-1",createdAt:now,startedAt:now,input:{},progressText:""};
    (window as any).nexo.listActiveTasks=async()=>[task];
    useAssistantStore.getState().handleTaskEvent({kind:"created",taskId:task.id,task});
    for(let i=0;i<20;i++)useAssistantStore.getState().handleTaskEvent({kind:"token",taskId:task.id,token:"texto "});
  },"/stores/assistant.ts");
  await expect(page.locator(".chatMessage.streaming")).toHaveCount(1);
  await expect.poll(async()=>Math.abs((await page.locator('[data-message-id="history-0501"]').evaluate(node=>node.getBoundingClientRect().top))-before)).toBeLessThan(3);
});

test.describe("reduced motion chat navigation",()=>{
test.use({reducedMotion:"reduce"});
test("makes the jump-to-latest action immediate",async({page})=>{
  const viewport=page.locator(".chatViewport");
  await viewport.evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event("scroll",{bubbles:true}));});
  await page.evaluate(async(modulePath)=>{
    const {useAssistantStore}=await import(modulePath),now=new Date().toISOString();
    const task={id:"reduced-motion-stream",type:"assistant-chat",status:"running",conversationId:"preview-1",createdAt:now,startedAt:now,input:{},progressText:""};
    (window as any).nexo.listActiveTasks=async()=>[task];
    useAssistantStore.getState().handleTaskEvent({kind:"created",taskId:task.id,task});
    for(let index=0;index<8;index++)useAssistantStore.getState().handleTaskEvent({kind:"token",taskId:task.id,token:"continuação "});
  },"/stores/assistant.ts");
  await expect(page.locator(".chatMessage.streaming")).toBeVisible();
  const jump=page.getByRole("button",{name:"Nova resposta",exact:true});
  await expect(jump).toBeVisible();
  await page.evaluate(()=>{const original=(HTMLElement.prototype as any).scrollTo;HTMLElement.prototype.scrollTo=function(options:any,...args:any[]){if(this.classList.contains("chatViewport"))(window as any).__chatScrollBehavior=options?.behavior??"positional";return original.call(this,options,...args);};});
  await jump.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__chatScrollBehavior)).toBe("auto");
  await expect.poll(()=>viewport.evaluate(node=>node.scrollHeight-node.scrollTop-node.clientHeight)).toBeLessThanOrEqual(1);
});
});
