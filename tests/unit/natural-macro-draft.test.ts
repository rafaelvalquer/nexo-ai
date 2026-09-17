import { describe,expect,it } from "vitest";
import { AUTOMATION_ACTION_CATALOG } from "../../packages/core/src/automation/actions/catalog.js";
import { normalizeMacroDraft } from "../../packages/core/src/automation/natural-draft.js";

describe("natural-language macro drafts",()=>{
  it("accepts only catalog actions and fields, leaving required values reviewable",()=>{
    const draft=normalizeMacroDraft('```json\n{"name":"Rotina","actions":[{"type":"system.open_application","config":{"application":"chrome","shell":"dangerous"}}]}\n```',"Abrir o navegador","",AUTOMATION_ACTION_CATALOG);
    expect(draft.name).toBe("Rotina");expect(draft.actions).toHaveLength(1);expect(draft.actions[0]).toMatchObject({type:"system.open_application",config:{application:"chrome"}});expect(draft.actions[0].config).not.toHaveProperty("shell");expect(draft.actions[0].id).toBeTruthy();
    const incomplete=normalizeMacroDraft('{"actions":[{"type":"system.open_application","config":{}}]}',"Abrir um aplicativo",undefined,AUTOMATION_ACTION_CATALOG);expect(incomplete.actions[0].config.application).toBe("");
  });
  it("rejects actions outside the catalog and invalid/oversized drafts",()=>{
    expect(()=>normalizeMacroDraft('{"actions":[{"type":"system.run_shell","config":{}}]}',"Pedido",undefined,AUTOMATION_ACTION_CATALOG)).toThrow(/não permitida/);
    expect(()=>normalizeMacroDraft('{"actions":[]}',"Pedido",undefined,AUTOMATION_ACTION_CATALOG)).toThrow(/entre 1 e 20/);
    expect(()=>normalizeMacroDraft("not json","Pedido",undefined,AUTOMATION_ACTION_CATALOG)).toThrow(/definição de macro válida/);
  });
});
