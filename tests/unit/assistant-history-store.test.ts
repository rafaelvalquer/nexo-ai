import { beforeEach,afterEach,it,expect,vi } from "vitest";
import type { ChatMessage } from "../../packages/shared/src/index.js";
let store: typeof import("../../apps/desktop/renderer/stores/assistant.js").useAssistantStore;
let messages:ChatMessage[], api:any;
const stamp="2026-09-16T12:00:00.000Z";
const make=(n:number,id="c"):ChatMessage=>({id:`m-${String(n).padStart(4,"0")}`,conversationId:id,createdAt:stamp,role:"assistant",content:`message ${n}`});
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve};};
beforeEach(async()=>{
  vi.resetModules();store=(await import("../../apps/desktop/renderer/stores/assistant.js")).useAssistantStore;
  messages=Array.from({length:120},(_,i)=>make(i));
  api={listConversations:vi.fn(async()=>[{id:"c",title:"Chat",createdAt:stamp,updatedAt:stamp}]),listActiveTasks:vi.fn(async()=>[]),
    conversationMessagePage:vi.fn(async(id:string,{before,limit=50}:any={})=>{const eligible=messages.filter(m=>m.conversationId===id&&(!before||m.id<before.id));const page=structuredClone(eligible.slice(-limit));const hasMore=eligible.length>limit;return{messages:page,hasMore,nextCursor:hasMore?{conversationId:id,createdAt:stamp,id:page[0].id}:undefined};}),
    deleteConversation:vi.fn(async()=>({ok:true}))};
  vi.stubGlobal("window",{nexo:api});await store.getState().sync();
});
afterEach(()=>vi.unstubAllGlobals());
const current=()=>store.getState().sessions.find(item=>item.id==="c")!;
it("keeps loaded pages after periodic sync and merges new arrivals",async()=>{
  expect(current().messages).toHaveLength(50);await store.getState().loadOlderMessages("c");expect(current().messages).toHaveLength(100);
  messages.push(make(120));await store.getState().sync();expect(current().messages).toHaveLength(101);expect(current().messages.at(-1)?.id).toBe("m-0120");
  await store.getState().loadOlderMessages("c");expect(current().messages).toHaveLength(121);expect(current().hasMoreHistory).toBe(false);
});
it("fills a gap larger than a page without losing existing history",async()=>{
  messages.push(...Array.from({length:130},(_,i)=>make(i+120)));await store.getState().syncSession("c");
  expect(current().messages).toHaveLength(180);expect(new Set(current().messages.map(m=>m.id)).size).toBe(180);expect(current().messages[0].id).toBe("m-0070");
});
it("serializes older-page and sync requests and ignores double clicks",async()=>{
  const gate=deferred(), read=api.conversationMessagePage.getMockImplementation();api.conversationMessagePage.mockImplementationOnce(async(...args:any[])=>{await gate.promise;return read(...args);});
  const old=store.getState().loadOlderMessages("c");await vi.waitFor(()=>expect(api.conversationMessagePage).toHaveBeenCalledTimes(2));
  const sync=store.getState().syncSession("c");await store.getState().loadOlderMessages("c");expect(api.conversationMessagePage).toHaveBeenCalledTimes(2);
  gate.resolve(undefined);await Promise.all([old,sync]);expect(current().messages).toHaveLength(100);
});
it("discards an in-flight snapshot when a resource event changes a message",async()=>{
  const gate=deferred(),old=await api.conversationMessagePage("c");api.conversationMessagePage.mockImplementationOnce(()=>gate.promise);
  const sync=store.getState().syncSession("c");await vi.waitFor(()=>expect(api.conversationMessagePage).toHaveBeenCalledTimes(3));
  const block:any={id:"approval",version:1,type:"approval",approvalId:"a",status:"approved"};
  messages.at(-1)!.blocks=[block];store.getState().updateMessageBlock("c",messages.at(-1)!.id,block);
  gate.resolve(old);await sync;expect(current().messages.at(-1)?.blocks).toEqual([block]);
});
it("retains content after pagination failure and permits retry",async()=>{
  api.conversationMessagePage.mockRejectedValueOnce(new Error("offline"));await store.getState().loadOlderMessages("c");
  expect(current().messages).toHaveLength(50);expect(current().historyError).toBe("offline");expect(current().historyLoading).toBe(false);
  await store.getState().loadOlderMessages("c");expect(current().historyError).toBeUndefined();expect(current().messages).toHaveLength(100);
});
it("does not resurrect a closed conversation from pending reads",async()=>{
  const other={...current(),id:"other",messages:[]};store.setState(state=>({sessions:[...state.sessions,other]}));
  const gate=deferred(),response=await api.conversationMessagePage("c");api.conversationMessagePage.mockImplementationOnce(()=>gate.promise);
  const sync=store.getState().syncSession("c");await vi.waitFor(()=>expect(api.conversationMessagePage).toHaveBeenCalledTimes(3));
  await store.getState().closeSession("c");gate.resolve(response);await sync;expect(current()).toBeUndefined();
});
it("keeps pagination results in their own chat after switching tabs",async()=>{
  store.setState(state=>({sessions:[...state.sessions,{...current(),id:"other",messages:[]}]}));
  const gate=deferred(),read=api.conversationMessagePage.getMockImplementation();api.conversationMessagePage.mockImplementationOnce(async(...args:any[])=>{await gate.promise;return read(...args);});
  const old=store.getState().loadOlderMessages("c");await vi.waitFor(()=>expect(api.conversationMessagePage).toHaveBeenCalledTimes(2));
  store.getState().selectSession("other");gate.resolve(undefined);await old;
  expect(store.getState().activeSessionId).toBe("other");expect(current().messages).toHaveLength(100);expect(store.getState().sessions.find(s=>s.id==="other")?.messages).toHaveLength(0);
});

it("removes stale messages when the complete server history is replaced or emptied",async()=>{
  messages=[make(500)];await store.getState().syncSession("c");expect(current().messages.map(m=>m.id)).toEqual(["m-0500"]);
  messages=[];await store.getState().syncSession("c");expect(current().messages).toEqual([]);expect(current().hasMoreHistory).toBe(false);
});
