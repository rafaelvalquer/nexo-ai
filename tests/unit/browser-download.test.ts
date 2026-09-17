import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import { browserTools } from "../../packages/core/src/tools/browser/index.js";

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});

describe("browser download tool",()=>{
  it("saves the downloaded file into an authorized target without replacing existing files",async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"nexo-browser-download-"));roots.push(root);const output=path.join(root,"report.csv"),click=vi.fn();
    const page={waitForEvent:async()=>({failure:async()=>null,suggestedFilename:()=>"report.csv",saveAs:async(temp:string)=>fs.writeFile(temp,"a,b\n1,2\n")}),locator:()=>({first:()=>({click})})};
    const tool=browserTools({page:async()=>page} as any).find(item=>item.name==="browser_download")!;
    const result=await tool.execute({selector:"#download",path:output},{runId:"run-1"});
    expect(result).toMatchObject({ok:true,data:{path:output,fileName:"report.csv"}});expect(await fs.readFile(output,"utf8")).toContain("a,b");expect(click).toHaveBeenCalledWith({timeout:10000});
    await expect(tool.execute({selector:"#download",path:output},{runId:"run-1"})).rejects.toThrow(/already exists|exist/i);
  });
  it("rejects relative output paths before interacting with the browser",async()=>{
    const page={waitForEvent:vi.fn(),locator:vi.fn()},tool=browserTools({page:async()=>page} as any).find(item=>item.name==="browser_download")!;
    await expect(tool.execute({selector:"#download",path:"report.csv"},{})).rejects.toThrow(/absoluto/i);expect(page.waitForEvent).not.toHaveBeenCalled();expect(page.locator).not.toHaveBeenCalled();
  });
});
