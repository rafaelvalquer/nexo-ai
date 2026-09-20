import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers=vi.hoisted(()=>new Map<string,(...args:any[])=>unknown>());
vi.mock("electron",()=>({ipcMain:{handle:(channel:string,handler:(...args:any[])=>unknown)=>handlers.set(channel,handler)}}));

import { registerEmailPreferencesIpc } from "../../apps/desktop/electron/ipc/email-preferences.js";

const invoke=(channel:string,...args:unknown[])=>Promise.resolve().then(()=>handlers.get(channel)!({},...args));

describe("Email preferences IPC",()=>{
  beforeEach(()=>handlers.clear());

  it("delegates GET and SAVE to NexoCore",async()=>{
    const core={
      getEmailSearchPreferences:vi.fn(async(id:string)=>({connectionId:id,categories:["primary"]})),
      saveEmailSearchPreferences:vi.fn(async(id:string,categories:string[])=>({connectionId:id,categories}))
    };
    registerEmailPreferencesIpc(core as any);

    await expect(invoke("nexo:connections:email-preferences:get","acc-1")).resolves.toMatchObject({connectionId:"acc-1"});
    await expect(invoke("nexo:connections:email-preferences:save","acc-1",["primary","updates"])).resolves.toMatchObject({categories:["primary","updates"]});
    expect(core.getEmailSearchPreferences).toHaveBeenCalledWith("acc-1");
    expect(core.saveEmailSearchPreferences).toHaveBeenCalledWith("acc-1",["primary","updates"]);
  });

  it("rejects malformed IPC payloads before delegation",async()=>{
    const core={getEmailSearchPreferences:vi.fn(),saveEmailSearchPreferences:vi.fn()};
    registerEmailPreferencesIpc(core as any);

    await expect(invoke("nexo:connections:email-preferences:get"," ")).rejects.toThrow("ID da conexão inválido.");
    await expect(invoke("nexo:connections:email-preferences:save","acc-1","primary")).rejects.toThrow("Categorias inválidas.");
    await expect(invoke("nexo:connections:email-preferences:save","acc-1",["primary",7])).rejects.toThrow("Categorias inválidas.");
    expect(core.saveEmailSearchPreferences).not.toHaveBeenCalled();
  });

  it("lets the Core reject an empty category selection",async()=>{
    const core={saveEmailSearchPreferences:vi.fn(async()=>{throw new Error("Selecione pelo menos uma caixa.");})};
    registerEmailPreferencesIpc(core as any);
    await expect(invoke("nexo:connections:email-preferences:save","acc-1",[])).rejects.toThrow("Selecione pelo menos uma caixa.");
    expect(core.saveEmailSearchPreferences).toHaveBeenCalledWith("acc-1",[]);
  });
});
