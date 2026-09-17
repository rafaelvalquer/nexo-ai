import os from "node:os";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router.js";

describe("Nexo 1.0 acceptance command routing",()=>{
  const projects=path.join(os.tmpdir(),"Projetos");
  const router=new FastIntentRouter();
  const options={allowedRoots:[projects]};
  it("opens named applications and authorized folders without an LLM",()=>{
    expect(router.route("Abra o Chrome.",options)).toMatchObject({tool:"open_application",input:{application:"Chrome"}});
    expect(router.route("Abra minha pasta Projetos.",options)).toMatchObject({tool:"open_path",input:{path:projects}});
  });
  it("sorts the requested process list by memory rather than CPU",()=>{
    expect(router.route("Mostre os programas consumindo mais memória.",options)).toMatchObject({tool:"process_list",input:{sortBy:"memory"}});
  });
  it("searches and summarizes an exact filename inside configured roots",()=>{
    expect(router.route("Procure arquivo relatorio.csv.",options)).toMatchObject({tool:"search_files",input:{paths:[projects],query:"relatorio.csv"}});
    expect(router.route("Resuma contrato.pdf.",options)).toMatchObject({tool:"document_summarize_named",input:{fileName:"contrato.pdf"}});
  });
  it("routes public research to Web Reader and does not invent a query for an unspecified current page",()=>{
    expect(router.route("Pesquise as principais notícias do InfoMoney.",options)).toMatchObject({tool:"web_search"});
    expect(router.route("Resuma esta página.",options)).toBeNull();
  });
  it("routes macro listing and execution by name through the macro engine tools",()=>{
    expect(router.route("Quais são minhas macros?",options)).toMatchObject({tool:"macro_list"});
    expect(router.route("Execute a macro Começar Trabalho.",options)).toMatchObject({tool:"macro_run",input:{name:"Começar Trabalho"}});
  });
  it("routes a natural-language macro draft and only confirms it after an explicit reply",()=>{
    expect(router.route("Crie uma macro chamada Início do Trabalho que abra Chrome e VS Code.",options)).toMatchObject({tool:"macro_create_draft",input:{name:"Início do Trabalho",description:"abra Chrome e VS Code"}});
    expect(router.route("Confirmo a criação da macro.",options)).toMatchObject({tool:"macro_confirm_draft",input:{confirm:true}});
  });
});
