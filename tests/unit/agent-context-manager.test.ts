import {describe,expect,it} from "vitest";
import {AgentContextManager} from "../../packages/core/src/agent/context/agent-context-manager.js";

describe("AgentContextManager",()=>{
  it("preserva a referência necessária para abrir o segundo resultado do Genesis",()=>{
    const messages=new AgentContextManager().build("Abra o segundo",[
      {role:"user",content:"Encontre meus arquivos do Genesis",trust:"TRUSTED_LOCAL"},
      {role:"assistant",content:"1. C:\\Projetos\\Genesis\\README.md\n2. C:\\Projetos\\Genesis\\arquitetura.md",trust:"SENSITIVE_LOCAL"}
    ]);
    expect(messages.at(-1)?.content).toBe("Abra o segundo");
    expect(messages.some(message=>message.content.includes("2. C:\\Projetos\\Genesis\\arquitetura.md"))).toBe(true);
  });

  it("resume o contexto antigo sem persistir chain-of-thought",()=>{
    const messages=new AgentContextManager(6_000).build("Continue",Array.from({length:60},(_,index)=>({role:index%2?"assistant" as const:"user" as const,content:`referência-${index} ${"x".repeat(160)}`,trust:"TRUSTED_LOCAL" as const})).concat([{role:"assistant",content:"chain-of-thought: segredo",trust:"TRUSTED_LOCAL"}]));
    expect(messages.some(message=>message.content.includes("Resumo determinístico"))).toBe(true);
    expect(JSON.stringify(messages)).not.toContain("chain-of-thought: segredo");
  });
});
