import {describe,expect,it} from "vitest";
import {RouteConflictGuard} from "../../../packages/core/src/application/route-conflict-guard.js";

describe("RouteConflictGuard",()=>{
  const guard=new RouteConflictGuard();
  it.each(["find_file","search_files","list_files","file_info","read_file"])("rejeita %s como final de pedido de mutação",tool=>{
    expect(guard.evaluate("alterar o conteudo do arquivo teste123.txt para abc",{type:"tool",tool,input:{}})).toEqual({accepted:false,reason:"read_vs_mutation"});
  });
  it("mantém leitura explícita",()=>{
    expect(guard.evaluate("procure teste123.txt",{type:"tool",tool:"find_file",input:{}})).toEqual({accepted:true});
  });
  it("aceita find_file quando ele é somente a etapa de discovery de um deferred write",()=>{
    expect(guard.evaluate("troque o conteúdo do teste123.txt por abc",{type:"tool",tool:"find_file",input:{name:"teste123.txt"},deferredAction:{kind:"filesystem.write_text",fileName:"teste123.txt",content:"abc"}})).toEqual({accepted:true});
  });
  it("mantém mutation tool",()=>{
    expect(guard.evaluate("crie teste.txt em downloads",{type:"tool",tool:"create_text_file",input:{}})).toEqual({accepted:true});
  });
});
