import {describe,expect,it} from "vitest";
import {GoalBuilder} from "../../packages/core/src/agent/goal/goal-builder.js";
import {GoalUpdater} from "../../packages/core/src/agent/goal/goal-updater.js";
import {DateTimeResolver} from "../../packages/core/src/agent/resolution/datetime-resolver.js";
import {KnownFolderResolver} from "../../packages/core/src/agent/resolution/known-folder-resolver.js";
import {ModelRouter} from "../../packages/core/src/agent/model/model-router.js";
import {ToolCandidateSelector} from "../../packages/core/src/agent/orchestrator/tool-candidate-selector.js";

describe("plano de refinamento do Agent Loop",()=>{
  it("classifica um caminho lido como recurso de entrada, não como entregável",()=>{const state=new GoalBuilder().build("Leia C:\\dados\\entrada.pdf e resuma");expect(state.goal.resources[0]?.path).toBe("C:\\dados\\entrada.pdf");expect(state.goal.deliverables).toHaveLength(0);});
  it("classifica um caminho explicitamente criado como saída",()=>{const state=new GoalBuilder().build("Crie e salve o resumo em C:\\dados\\saida.md");expect(state.goal.deliverables[0]?.path).toBe("C:\\dados\\saida.md");});
  it("mantém falha transitória recuperável e conclui em nova tentativa",()=>{const state=new GoalBuilder().build("Liste os arquivos em Downloads");const updater=new GoalUpdater();const failed=updater.update(state,{toolCallId:"1",toolName:"list_files",ok:false,summary:"TEMPORARY_ERROR",trust:"TRUSTED_LOCAL",truncated:false});expect(failed.goal.steps[0].status).toBe("retryable_failed");expect(failed.goal.steps[0].attempts).toHaveLength(1);const recovered=updater.update(failed,{toolCallId:"2",toolName:"list_files",ok:true,summary:"ok",trust:"SENSITIVE_LOCAL",truncated:false});expect(recovered.goal.steps[0].status).toBe("completed");expect(recovered.goal.steps[0].attempts).toHaveLength(2);});
  it("resolve depois de amanhã antes de amanhã",()=>{const resolver=new DateTimeResolver("America/Sao_Paulo",()=>new Date("2026-09-16T15:00:00-03:00"));const period=resolver.resolvePeriod("depois de amanhã");expect(period.label).toBe("depois de amanhã");expect(period.start).toContain("2026-09-18");});
  it("resolve pastas conhecidas sem aceitar travessia",()=>{const resolver=new KnownFolderResolver();expect(resolver.resolve("Downloads")?.id).toBe("downloads");expect(resolver.resolve("Downloads/../../segredo")?.path).not.toContain("segredo");});
  it("roteia tarefas simples, estruturadas e complexas por perfil",()=>{const router=new ModelRouter({fast:"1.7b",balanced:"4b",quality:"8b"});expect(router.route("quanto de RAM eu tenho?").profile).toBe("FAST");expect(router.route("resuma o documento",2).profile).toBe("BALANCED");expect(router.route("pesquise na web e envie um e-mail",4).profile).toBe("QUALITY");});
  it("limita ferramentas simples a cinco e prioriza o pedido atual",()=>{const tools=Array.from({length:8},(_,index)=>({name:index===0?"email_search":`system_${index}`,description:index===0?"Busca e-mails":"Sistema",domain:index===0?"email":"system",operation:"read",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:[]}));const selected=new ToolCandidateSelector(6).select("Liste meus e-mails",tools as any,[{role:"user",content:"Antes falamos de memória"}]);expect(selected.length).toBeLessThanOrEqual(5);expect(selected[0].name).toBe("email_search");});
});
