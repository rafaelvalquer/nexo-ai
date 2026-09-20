import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers=vi.hoisted(()=>new Map<string,(...args:any[])=>unknown>());
vi.mock("electron",()=>({ipcMain:{handle:(channel:string,handler:(...args:any[])=>unknown)=>handlers.set(channel,handler)}}));

import { registerDashboardEmailIpc } from "../../apps/desktop/electron/ipc/dashboard-email.js";

const invoke=(channel:string,...args:unknown[])=>Promise.resolve().then(()=>handlers.get(channel)!({},...args));

describe("Dashboard email IPC",()=>{
  beforeEach(()=>handlers.clear());

  it("delegates trash with validated identifiers",async()=>{
    const core={dashboardEmailMessage:vi.fn(),dashboardEmailReply:vi.fn(),dashboardEmailTrash:vi.fn(async input=>({approvalId:"a1",input}))};
    registerDashboardEmailIpc(core as any);
    await expect(invoke("nexo:dashboard:email-trash",{connectionId:" c1 ",messageId:" m1 "})).resolves.toMatchObject({approvalId:"a1"});
    expect(core.dashboardEmailTrash).toHaveBeenCalledWith({connectionId:"c1",messageId:"m1"});
  });

  it("rejects invalid trash payloads",async()=>{
    const core={dashboardEmailMessage:vi.fn(),dashboardEmailReply:vi.fn(),dashboardEmailTrash:vi.fn()};
    registerDashboardEmailIpc(core as any);
    await expect(invoke("nexo:dashboard:email-trash",null)).rejects.toThrow("Dados de exclusão inválidos.");
    await expect(invoke("nexo:dashboard:email-trash",{connectionId:"",messageId:"m1"})).rejects.toThrow("Conexão inválido.");
    await expect(invoke("nexo:dashboard:email-trash",{connectionId:"c1",messageId:""})).rejects.toThrow("Mensagem inválido.");
    expect(core.dashboardEmailTrash).not.toHaveBeenCalled();
  });
});
