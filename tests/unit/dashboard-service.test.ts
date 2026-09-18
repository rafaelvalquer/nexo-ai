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
  it("removes Tech Pulse from the supported catalog and automatically provisions connected gadgets only once",()=>{
    expect(service.catalog().some(item=>item.id==="tech-news" as any)).toBe(false);
    expect(()=>service.add("tech-news" as any)).toThrow(/não registrado/i);
    const capabilities=new Set(["email.read","calendar.read"]);
    for(let i=0;i<10;i++)service.syncConnectedGadgets(capabilities);
    expect(service.layout().filter(item=>item.gadgetId==="email")).toHaveLength(1);
    expect(service.layout().filter(item=>item.gadgetId==="agenda")).toHaveLength(1);
  });
  it("does not auto-provision without capability and honors dismissal across repeated sync",()=>{
    service.syncConnectedGadgets(new Set());
    expect(service.layout().some(item=>item.gadgetId==="email")).toBe(false);
    const item=service.add("email");service.remove(item.instanceId);
    service.syncConnectedGadgets(new Set(["email.read"]));
    expect(service.layout().some(value=>value.gadgetId==="email")).toBe(false);
    const manuallyAdded=service.add("email");
    expect(service.layout().some(value=>value.instanceId===manuallyAdded.instanceId)).toBe(true);
  });
  it("migration 19 deletes saved Tech Pulse layout and cache entries",async()=>{
    const old=new DashboardService(db,async id=>({id}));const oldItem={instanceId:"legacy-tech",gadgetId:"tech-news",position:40,size:"L",configuration_json:"{}",enabled:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    db.run("INSERT INTO dashboard_gadgets(instance_id,gadget_id,position,size,configuration_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",[oldItem.instanceId,oldItem.gadgetId,oldItem.position,oldItem.size,oldItem.configuration_json,oldItem.enabled,oldItem.created_at,oldItem.updated_at]);
    db.run("INSERT INTO dashboard_cache(provider,cache_key,payload_json,fetched_at,expires_at) VALUES('tech-news','tech-news','[]','now','later')");
    db.run("DELETE FROM schema_migrations WHERE version=19");
    const upgraded=new NexoDatabase(root);await upgraded.ready();
    expect(upgraded.get("SELECT instance_id FROM dashboard_gadgets WHERE gadget_id='tech-news'")).toBeUndefined();
    expect(upgraded.get("SELECT cache_key FROM dashboard_cache WHERE provider='tech-news'")).toBeUndefined();
  });
});
