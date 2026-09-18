import { describe,expect,it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("hybrid intent eval dataset",()=>{
  it("mantém ao menos 100 frases de filesystem",()=>{
    const dir=path.resolve("tests/evals/intents");
    const files=fs.readdirSync(dir).filter(name=>name.endsWith(".json"));
    const rows=files.flatMap(name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8")));
    expect(rows.length).toBeGreaterThanOrEqual(100);
    expect(rows.some((row:any)=>row.input==="crie a pasta teste dentro da pasta downloads")).toBe(true);
    expect(rows.some((row:any)=>row.input==="alterar o conteudo do arquivo teste123.txt para teste modificação")).toBe(true);
  });
});
