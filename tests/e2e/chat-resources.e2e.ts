import path from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { ChatPresentationBuilder } from "../../packages/core/src/chat/presentation/builder";
let server:ViteDevServer,url:string;
test.use({channel:process.env.PLAYWRIGHT_CHANNEL});
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Preview unavailable");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});
const builder=new ChatPresentationBuilder();
function fixture(){
  const emails=builder.fromToolResult("email_search",{ok:true,summary:"Texto de fallback que não deve duplicar os cards",data:{messages:Array.from({length:20},(_,index)=>({id:`email-${index}`,subject:`Assunto ${index+1}: mensagem de exemplo`,from:{name:"Sitly",email:"info@example.com"},receivedAt:"2026-09-14T08:05:00Z",isUnread:true,...(index?{snippet:"Trecho da mensagem para leitura rápida."}:{})})),total:20}},{connectionId:"account",unread:true});
  return [{id:"message-cards",conversationId:"preview-1",role:"assistant",content:"Texto de fallback que não deve duplicar os cards",createdAt:new Date().toISOString(),blocks:emails.presentation.blocks}];
}
test.beforeEach(async({page})=>{
  await page.goto(url);await page.getByRole("button",{name:"Assistente",exact:true}).click();
  await page.evaluate(async({messages,modulePath})=>{
    const api=(window as any).nexo;
    (window as any).__resourceRequests=[];(window as any).__resourceApprovals=[];
    api.conversationMessages=async()=>structuredClone(messages);
    api.executeChatAction=async(request:any)=>{
      (window as any).__resourceRequests.push(request);
      const block:any=messages[0].blocks.find((block:any)=>block.id===request.blockId),item=block.items.find((item:any)=>item.id===request.itemId);
      if(request.actionId==="email.expand"){item.resource.bodyText="Corpo completo da mensagem selecionada.";return{item:structuredClone(item)};}
      const approval:any={id:"inline-approval",version:1,type:"approval",approvalId:"approval-id",title:"Revisar ação selecionada",preview:request.values?.bodyText??item.resource.subject,consequence:"Somente os e-mails selecionados serão alterados.",status:"pending"};
      item.state="awaiting_approval";item.pendingApprovalId=approval.approvalId;messages[0].blocks=messages[0].blocks.filter((block:any)=>block.type!=="approval");messages[0].blocks.push(approval);
      return{item:structuredClone(item),approval};
    };
    api.resolveInlineApproval=async(_conversation:any,_message:any,id:any,approved:any)=>{(window as any).__resourceApprovals.push({id,approved});const approval:any=messages[0].blocks.find((block:any)=>block.type==="approval");approval.status=approved?"approved":"rejected";return{approval:structuredClone(approval)};};
    const {useAssistantStore}=await import(modulePath);await useAssistantStore.getState().sync();
  },{messages:fixture(),modulePath:"/stores/assistant.ts"});
});
test("email cards paginate, expand, select exact items and confirm inline at 910px",async({page},info)=>{
  await page.setViewportSize({width:910,height:698});
  await expect(page.locator(".resourceCard")).toHaveCount(8);
  await expect(page.getByText("Texto de fallback que não deve duplicar os cards")).toHaveCount(0);
  await page.getByRole("button",{name:"Mostrar mais",exact:true}).click();await expect(page.locator(".resourceCard")).toHaveCount(16);
  await page.getByRole("button",{name:"Mostrar mais",exact:true}).click();await expect(page.locator(".resourceCard")).toHaveCount(20);
  await page.getByRole("button",{name:"Assunto 1: mensagem de exemplo",exact:true}).click();
  await expect(page.getByText("Corpo completo da mensagem selecionada.")).toBeVisible();
  for(let index=1;index<=3;index++)await page.getByRole("checkbox",{name:`Selecionar Assunto ${index}: mensagem de exemplo`,exact:true}).check();
  await page.getByRole("group",{name:"Ações dos e-mails selecionados"}).getByRole("button",{name:"Mover para a lixeira",exact:true}).click();
  await expect(page.getByRole("region",{name:"Confirmação da ação"})).toBeVisible();
  expect(await page.evaluate(()=>((window as any).__resourceRequests.at(-1).itemIds as string[]).length)).toBe(3);
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();await expect(page.getByText("Aprovação concedida",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("chat-cards-910.png")});
});
test("keyboard reply opens a composer and requires a separate confirmation",async({page},info)=>{
  await page.setViewportSize({width:1280,height:850});
  const first=page.locator(".resourceCard").first();
  await first.getByRole("button",{name:"Responder",exact:true}).focus();await page.keyboard.press("Enter");
  await page.getByRole("textbox",{name:"Texto da resposta"}).fill("Obrigado, recebi a mensagem.");
  expect(await page.evaluate(()=>(window as any).__resourceRequests.length)).toBe(0);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("region",{name:"Confirmação da ação"})).toContainText("Obrigado, recebi a mensagem.");
  expect(await page.evaluate(()=>(window as any).__resourceApprovals.length)).toBe(0);
  await page.getByRole("button",{name:"Cancelar",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(page.getByText("Ação cancelada",{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("chat-reply-keyboard.png")});
});

for(const label of ["Arquivar","Marcar como lido","Mover para a lixeira"]){
  test(`keyboard ${label} prepares an exact card approval`,async({page})=>{
    const card=page.locator(".resourceCard").first();
    await card.getByRole("button",{name:label,exact:true}).focus();await page.keyboard.press("Enter");
    await expect(page.getByRole("region",{name:"Confirmação da ação"})).toBeVisible();
    const request=await page.evaluate(()=>(window as any).__resourceRequests.at(-1));
    expect(request.itemId).toBe(await card.getAttribute("data-resource-id"));expect(request.itemIds).toBeUndefined();
    await page.getByRole("button",{name:"Cancelar",exact:true}).focus();await page.keyboard.press("Enter");
    expect(await page.evaluate(()=>(window as any).__resourceApprovals.at(-1).approved)).toBe(false);
  });
}

test("file, folder, calendar and generic cards preserve keyboard controls and legacy Markdown",async({page},info)=>{
  const files=builder.fromToolResult("list_files",{ok:true,summary:"Arquivos",data:[{name:"report.csv",path:"C:\\Downloads\\report.csv",type:"file",size:2800},{name:"Relatórios",path:"C:\\Downloads\\Relatórios",type:"directory",childCount:27}]}).presentation.blocks;
  const calendar=builder.fromToolResult("calendar_list",{ok:true,summary:"Agenda",data:[{id:"event",title:"Daily URA",start:"2026-09-14T10:00:00Z",end:"2026-09-14T10:30:00Z",location:"Microsoft Teams",meetingUrl:"https://example.com/meeting"}]},{connectionId:"account"}).presentation.blocks;
  const generic=builder.fromToolResult("unknown_tool",{ok:true,summary:"Resumo seguro da ferramenta",data:[{secret:"nunca exibir"}]}).presentation.blocks;
  const messages=[{id:"mixed",conversationId:"preview-1",role:"assistant",content:"Fallback",createdAt:new Date().toISOString(),blocks:[...files,...calendar,...generic]},{id:"legacy",conversationId:"preview-1",role:"assistant",content:"**Mensagem antiga** continua legível.",createdAt:new Date().toISOString()}];
  await page.evaluate(async({messages,modulePath})=>{(window as any).nexo.conversationMessages=async()=>structuredClone(messages);const {useAssistantStore}=await import(modulePath);await useAssistantStore.getState().sync();},{messages,modulePath:"/stores/assistant.ts"});
  await page.setViewportSize({width:910,height:698});
  await expect(page.locator(".resourceCard")).toHaveCount(4);await expect(page.getByText("Mensagem antiga",{exact:true})).toBeVisible();await expect(page.getByText("nunca exibir")).toHaveCount(0);
  const buttons=page.locator(".resourceCardActions button");
  const expected=new Set(await buttons.evaluateAll(elements=>elements.map(element=>element.getAttribute("aria-label"))));
  await buttons.first().focus();const visited=new Set<string>();
  for(let index=0;index<90&&visited.size<expected.size;index++){
    const label=await page.evaluate(()=>document.activeElement?.classList.contains("resourceActionButton")?document.activeElement.getAttribute("aria-label"):null);
    if(label)visited.add(label);await page.keyboard.press("Tab");
  }
  expect([...visited].sort()).toEqual([...expected].sort());
  for(const [title,button,field] of [["report.csv","Renomear","Novo nome"],["report.csv","Mover","Pasta de destino"],["Relatórios","Pesquisar na pasta","Pesquisar por nome"],["Daily URA","Editar compromisso","Título"],["Daily URA","Responder convite","Resposta ao convite"]]){
    const card=page.locator(".resourceCard").filter({hasText:title});await card.getByRole("button",{name:button,exact:true}).focus();await page.keyboard.press("Enter");await expect(card.getByLabel(field,{exact:true})).toBeFocused();await page.keyboard.press("Escape");await expect(card.locator("form")).toHaveCount(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator(".resourceCard").filter({hasText:"Daily URA"}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("mixed-cards-910.png")});
});
