import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { DashboardService } from "../../packages/core/src/dashboard/service.js";

let root:string,db:NexoDatabase,service:DashboardService;
beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-dashboard-"));db=new NexoDatabase(root);await db.ready();service=new DashboardService(db,async id=>({id}));});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));

describe("DashboardService",()=>{
  it("seeds only local gadgets and exposes external providers without fetching them",()=>{
    expect(service.layout().map(item=>item.gadgetId)).toEqual(["ai-status","tasks","approvals","automations","activity","documents","system"]);
    expect(service.catalog().find(item=>item.id==="weather")).toMatchObject({provider:"http",requiresInternet:true,requiresConfiguration:true});
    expect(service.catalog().find(item=>item.id==="business-days")).toMatchObject({provider:"http",requiresInternet:true});
  });
  it("requires explicit valid weather coordinates and a real city before saving",()=>{
    expect(()=>service.add("weather",{})).toThrow(/latitude/);
    expect(()=>service.add("weather",{place:"São Paulo",latitude:0,longitude:0})).not.toThrow();
    expect(()=>service.add("weather",{place:"",latitude:0,longitude:0})).toThrow(/local/);
  });
  it("enforces each gadget's own size limits for add, configure and layout",()=>{
    expect(()=>service.add("business-days",{}, "XL")).toThrow(/Tamanho/);
    const gadget=service.add("business-days");
    expect(()=>service.configure(gadget.instanceId,{},"XL")).toThrow(/Tamanho/);
    const layout=service.layout().map((item,position)=>({instanceId:item.instanceId,size:item.size,position}));
    layout[0]={...layout[0],size:"XL"};
    expect(()=>service.saveLayout(layout)).toThrow(/layout/i);
  });
  it("rejects malformed or unsafe currency preferences before any network request",()=>{
    expect(()=>service.add("currency",{currencies:"BRL,USD"})).toThrow(/moedas/i);
    expect(()=>service.add("currency",{currencies:"USD,USD"})).toThrow(/moedas/i);
    expect(()=>service.add("currency",{currencies:"USD,EUR,GBP,JPY,CAD,AUD,CHF"})).toThrow(/moedas/i);
  });
});
