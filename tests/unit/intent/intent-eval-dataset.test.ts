import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";

const phase1Files=[
  "filesystem-create-folder.json",
  "filesystem-create-file.json",
  "filesystem-find-file.json",
  "filesystem-list.json",
  "filesystem-write-file.json",
  "ambiguous-cases.json",
  "filesystem-real-world-regressions.json",
  "filesystem-manual-regressions-v2.json"
];

describe("hybrid intent eval dataset",()=>{
  it("mantém >=100 frases da Fase 1, sem depender dos datasets legados",()=>{
    const dir=path.resolve("tests/evals/intents");
    const rows=phase1Files.flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8")));
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(new Set(rows.map((row:any)=>row.input)).size).toBeGreaterThanOrEqual(105);
    expect(rows.some((row:any)=>row.input==="crie a pasta teste dentro da pasta downloads")).toBe(true);
    expect(rows.some((row:any)=>row.input==="alterar o conteudo do arquivo teste123.txt para teste modificação")).toBe(true);
    expect(rows.some((row:any)=>row.input==="será que dá pra fazer uma pastinha chamada Experimentos lá nos meus downloads?")).toBe(true);
    expect(rows.some((row:any)=>row.input==="não altere o arquivo teste123.txt")).toBe(true);
    const manual=JSON.parse(fs.readFileSync(path.join(dir,"filesystem-manual-regressions-v2.json"),"utf8"));
    expect(manual).toHaveLength(22);
    expect(manual.every((row:any)=>typeof row.expectedRouteSource==="string"&&typeof row.expectedExecutable==="boolean")).toBe(true);
    expect(manual.some((row:any)=>row.expectedDeferredAction==="filesystem.write_text")).toBe(true);
    expect(manual.some((row:any)=>row.expectedSafety==="traversal")).toBe(true);
  });

  it("golden cases executáveis têm operação e entidades obrigatórias mensuráveis",()=>{
    const dir=path.resolve("tests/evals/intents");
    const rows=phase1Files.filter(name=>name!=="ambiguous-cases.json").flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"))).filter((row:any)=>Boolean(row.operation));
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
