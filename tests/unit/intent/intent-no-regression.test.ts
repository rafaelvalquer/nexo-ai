import {describe,expect,it} from "vitest";
import path from "node:path";
import os from "node:os";
import {CommandService} from "../../../packages/core/src/application/command-service.js";
import {ToolRegistry} from "../../../packages/core/src/tools/registry.js";

describe("Hybrid Intent no-regression contract",()=>{
  const downloads=path.join(os.tmpdir(),"NexoNoRegression","Downloads");
  const service=new CommandService(new ToolRegistry(),()=>[downloads]);

  it.each([
    ["procure arquivo teste","find_file"],
    ["procure teste.txt","find_file"],
    ["liste downloads","list_files"],
    ["crie teste.txt em downloads","create_text_file"],
    ["crie teste.txt em downloads com conteúdo abc","create_text_file"],
    ["crie pasta teste em downloads","create_folder"]
  ])("mantém fast path: %s -> %s",(input,tool)=>{
    expect(service.route(input)).toMatchObject({type:"tool",tool});
  });

  it("mantém comandos com caminho físico fora do Hybrid fallback",async()=>{
    const route=service.route("Crie C:\\Projetos\\teste.txt com conteúdo abc");
    expect(route.type).not.toBe("chat");
  });
});
