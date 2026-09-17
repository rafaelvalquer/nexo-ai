import path from "node:path";
import { expect,test } from "@playwright/test";
import { createServer,type ViteDevServer } from "vite";

let server:ViteDevServer;let url:string;
test.beforeAll(async()=>{server=await createServer({configFile:path.resolve("apps/desktop/vite.config.ts"),root:path.resolve("apps/desktop/renderer"),server:{host:"127.0.0.1",port:0},logLevel:"error"});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw new Error("Prévia indisponível");url=`http://127.0.0.1:${address.port}`;});
test.afterAll(async()=>{await server?.close();});

test("Configurações > integrações preserva configuração, conexão, permissões e diagnóstico",async({page})=>{
  await page.goto(url);await page.evaluate(()=>{const api=window.nexo as any;const disconnect=api.disconnect.bind(api);api.disconnect=async(id:string)=>{(window as any).__disconnectCalls=((window as any).__disconnectCalls??0)+1;return disconnect(id);};});await page.getByRole("button",{name:"Configurações",exact:true}).click();
  await page.getByRole("button",{name:"Contas e integrações",exact:true}).click();
  await page.locator(".settingsConnections summary").click();
  await expect(page.getByRole("heading",{name:"Conexões"})).toBeVisible();await expect(page.getByText("Configuração necessária").first()).toBeVisible();
  await page.getByRole("button",{name:"Google OAuth"}).click();
  await page.getByLabel("Client ID").first().fill("preview.apps.googleusercontent.com");await page.getByPlaceholder("GOCSPX-…").fill("GOCSPX-preview");await page.getByRole("button",{name:"Salvar credenciais"}).click();
  await expect(page.getByText("Configuração OAuth salva com segurança.")).toBeVisible();
  await page.getByRole("button",{name:"Conectar Google"}).click();
  await expect(page.getByText("preview-google@nexo.local")).toBeVisible();
  await page.getByRole("button",{name:"Gerenciar conexão"}).click();await expect(page.getByRole("button",{name:/^Permissões \d+ de \d+ operacionais$/})).toHaveAttribute("aria-expanded","true");
  await page.getByRole("button",{name:/Estado da conexão/}).press("Enter");await expect(page.getByRole("button",{name:/Estado da conexão/})).toHaveAttribute("aria-expanded","true");
  await page.getByRole("button",{name:"Mais ações"}).click();await page.getByRole("main").getByRole("button",{name:"Diagnóstico",exact:true}).click();
  await expect(page.getByText("✓ Token presente",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Mais ações"}).click();await page.getByRole("button",{name:"Copiar diagnóstico"}).click();
  await page.getByRole("button",{name:"Mais ações"}).click();await page.getByRole("main").getByRole("button",{name:"Desconectar",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Desconectar Google?"})).toBeVisible();await page.getByRole("button",{name:"Cancelar"}).click();
  await expect(page.evaluate(()=>((window as any).__disconnectCalls??0))).resolves.toBe(0);await page.getByRole("main").getByRole("button",{name:"Desconectar",exact:true}).click();
  await page.getByRole("button",{name:"Desconectar conta"}).click();await expect(page.getByText("Ação concluída")).toBeVisible();await expect(page.evaluate(()=>((window as any).__disconnectCalls??0))).resolves.toBe(1);
});
