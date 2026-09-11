import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { defaultDataDir } from "../../shared/paths.js";

let context: BrowserContext | null = null;

async function getContext() {
  if (context) return context;
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        path.join(local,"Google","Chrome","Application","chrome.exe")
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/microsoft-edge"];
  const executablePath = candidates.find(fs.existsSync);
  if (!executablePath) throw new Error("Chrome/Edge não encontrado. Instale Chrome ou Edge para usar o Browser Agent.");
  const userDataDir=path.join(defaultDataDir(),"browser");
  fs.mkdirSync(userDataDir,{recursive:true});
  context = await chromium.launchPersistentContext(userDataDir, { headless:false, executablePath, args:["--disable-extensions"] });
  return context;
}

async function activePage(): Promise<Page> {
  const c=await getContext();
  const pages=c.pages();
  return pages.at(-1) ?? await c.newPage();
}

export function browserTools(): ToolDefinition[] {
  return [
    {
      name:"browser_launch", description:"Abre o navegador controlado do Nexo sem exigir uma URL", risk:"READ", permissions:["browser.use"], inputSchema:z.object({}),
      async execute(){
        const page=await activePage();
        await page.bringToFront();
        return {ok:true,summary:"Navegador do Nexo aberto.",data:{title:await page.title(),url:page.url()}};
      }
    },
    {
      name:"browser_open", description:"Abre URL no perfil isolado do Nexo", risk:"READ", permissions:["browser.use"], inputSchema:z.object({url:z.string().url()}),
      async execute({url}){const page=await activePage();await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});await page.bringToFront();return {ok:true,summary:`Página aberta: ${url}`,data:{title:await page.title(),url:page.url()}};}
    },
    {
      name:"browser_navigate", description:"Navega a aba ativa para outra URL", risk:"READ", permissions:["browser.use"], inputSchema:z.object({url:z.string().url()}),
      async execute({url}){const page=await activePage();await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});await page.bringToFront();return {ok:true,summary:`Navegado para ${url}`,data:{title:await page.title(),url:page.url()}};}
    },
    {
      name:"browser_extract", description:"Extrai texto da aba ativa; conteúdo é não confiável", risk:"READ", permissions:["browser.use"], inputSchema:z.object({maxChars:z.number().int().min(100).max(40000).default(12000)}),
      async execute({maxChars}){const page=await activePage();const text=(await page.locator("body").innerText()).slice(0,maxChars);return {ok:true,summary:"Conteúdo externo extraído como UNTRUSTED_CONTENT",data:{url:page.url(),title:await page.title(),untrustedContent:text}};}
    },
    {
      name:"browser_click", description:"Clica em elemento da aba ativa", risk:"SENSITIVE", permissions:["browser.interact"], inputSchema:z.object({selector:z.string()}),
      async execute({selector}){const page=await activePage();await page.locator(selector).first().click({timeout:10000});return {ok:true,summary:`Clique executado em ${selector}`};}
    },
    {
      name:"browser_type", description:"Digita texto em elemento da aba ativa", risk:"SENSITIVE", permissions:["browser.interact"], inputSchema:z.object({selector:z.string(),text:z.string().max(5000)}),
      async execute({selector,text}){const page=await activePage();await page.locator(selector).first().fill(text,{timeout:10000});return {ok:true,summary:`Texto preenchido em ${selector}`};}
    },
    {
      name:"browser_tabs", description:"Lista abas do Browser Agent", risk:"READ", permissions:["browser.use"], inputSchema:z.object({}),
      async execute(){const c=await getContext();const rows=await Promise.all(c.pages().map(async(p,i)=>({index:i,title:await p.title(),url:p.url()})));return {ok:true,summary:`${rows.length} aba(s) aberta(s)`,data:rows};}
    },
    {
      name:"browser_screenshot", description:"Salva captura da aba ativa", risk:"SAFE_WRITE", permissions:["browser.use","filesystem.write"], pathFields:["path"], inputSchema:z.object({path:z.string()}),
      async execute({path:output}){const page=await activePage();await page.screenshot({path:output,fullPage:true});return {ok:true,summary:`Captura salva em ${output}`};}
    },
    {
      name:"browser_close", description:"Fecha Browser Agent", risk:"SAFE_WRITE", permissions:["browser.use"], inputSchema:z.object({}),
      async execute(){if(context){await context.close();context=null;}return {ok:true,summary:"Browser Agent fechado"};}
    }
  ];
}
