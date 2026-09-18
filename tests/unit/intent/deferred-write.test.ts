import { describe,expect,it } from "vitest";
import { materializeDeferredAction } from "../../../packages/core/src/agent/orchestrator/action-preflight.js";

describe("filesystem deferred write",()=>{
  const action={kind:"filesystem.write_text" as const,fileName:"teste123.txt",content:"teste modificação"};

  it("materializa write_text_file somente com um resultado único",()=>{
    const result=materializeDeferredAction(action,{ok:true,success:true,summary:"1 encontrado",data:{matches:[{name:"teste123.txt",path:"C:\\Users\\Rafael\\Downloads\\teste123.txt"}]}});
    expect(result.step).toMatchObject({tool:"write_text_file",input:{path:"C:\\Users\\Rafael\\Downloads\\teste123.txt",content:"teste modificação"},approval:{actionType:"update"}});
  });

  it("não escolhe automaticamente quando há múltiplos arquivos",()=>{
    const result=materializeDeferredAction(action,{ok:true,success:true,summary:"2 encontrados",data:{matches:[{path:"C:\\A\\teste123.txt"},{path:"C:\\B\\teste123.txt"}]}});
    expect(result.step).toBeUndefined();
    expect(result.direct).toContain("Encontrei 2 arquivos");
  });
});
