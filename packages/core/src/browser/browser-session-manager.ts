import fs from "node:fs";
import path from "node:path";
import { chromium,type BrowserContext,type Page } from "playwright-core";
import { defaultDataDir } from "../shared/paths.js";

export class BrowserSessionManager{
  private context:BrowserContext|null=null;
  private pagesByRun=new Map<string,Page[]>();
  private async getContext(){
    if(this.context)return this.context;
    const local=process.env.LOCALAPPDATA??"";
    const candidates=process.platform==="win32"?[
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",path.join(local,"Google","Chrome","Application","chrome.exe")
    ]:["/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/microsoft-edge"];
    const executablePath=candidates.find(fs.existsSync);if(!executablePath)throw new Error("Chrome/Edge não encontrado. Instale Chrome ou Edge para usar o Browser Agent.");
    const userDataDir=path.join(defaultDataDir(),"browser");fs.mkdirSync(userDataDir,{recursive:true});
    this.context=await chromium.launchPersistentContext(userDataDir,{headless:false,executablePath,args:["--disable-extensions"]});
    return this.context;
  }
  private key(runId?:string){return runId||"default";}
  async page(runId?:string){const key=this.key(runId);const owned=(this.pagesByRun.get(key)??[]).filter(page=>!page.isClosed());if(owned.length){this.pagesByRun.set(key,owned);return owned.at(-1)!;}const context=await this.getContext();let page:Page|undefined;if(this.pagesByRun.size===0){page=context.pages().find(item=>![...this.pagesByRun.values()].flat().includes(item));}page=page??await context.newPage();this.pagesByRun.set(key,[page]);return page;}
  async newPage(runId?:string){const key=this.key(runId),context=await this.getContext(),page=await context.newPage();this.pagesByRun.set(key,[...(this.pagesByRun.get(key)??[]).filter(item=>!item.isClosed()),page]);return page;}
  async pages(runId?:string){const key=this.key(runId);const rows=(this.pagesByRun.get(key)??[]).filter(page=>!page.isClosed());if(!rows.length)rows.push(await this.page(runId));this.pagesByRun.set(key,rows);return rows;}
  async closeRun(runId?:string){const key=this.key(runId);for(const page of this.pagesByRun.get(key)??[])if(!page.isClosed())await page.close().catch(()=>undefined);this.pagesByRun.delete(key);}
  async closeAll(){if(this.context)await this.context.close().catch(()=>undefined);this.context=null;this.pagesByRun.clear();}
}
