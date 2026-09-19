import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";

const phase1Files=[
  "filesystem-create-folder.json",
  "filesystem-create-file.json",
  "filesystem-find-file.json",
  "filesystem-list.json",
  "filesystem-write-file.json",
  "ambiguous-cases.json"
];

describe("hybrid intent eval dataset",()=>{
  it("mantém >=100 frases da Fase 1, sem depender dos datasets legados",()=>{
    const dir=path.resolve("tests/evals/intents");
    const rows=phase1Files.flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8")));
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(new Set(rows.map((row:any)=>row.input)).size).toBe(rows.length);
    expect(rows.some((row:any)=>row.input==="crie a pasta teste dentro da pasta downloads")).toBe(true);
    expect(rows.some((row:any)=>row.input==="alterar o conteudo do arquivo teste123.txt para teste modificação")).toBe(true);
  });

  it("golden cases executáveis têm operação e entidades obrigatórias mensuráveis",()=>{
    const dir=path.resolve("tests/evals/intents");
    const rows=phase1Files.slice(0,-1).flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8")));
    const required:Record<string,string[]>={
      create_folder:["name","folder"],
      create_text_file:["name","folder"],
      find_file:["name"],
      list_files:["folder"],
      write_text_file:["file","content"]
    };
    for(const row of rows){
      expect(row.operation).toBeTruthy();
      for(const key of required[row.operation]??[])expect(row.entities?.[key],`${row.input} -> ${key}`).toBeTruthy();
    }
  });
});
