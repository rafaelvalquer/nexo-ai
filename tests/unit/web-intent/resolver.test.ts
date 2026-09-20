import fs from "node:fs";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {deterministicWebIntent} from "../../../packages/core/src/intent/web/resolver.js";

describe("WebIntentResolver deterministic layer",()=>{
  it.each([
    ["acesse o InfoMoney","navigate"],
    ["abra o InfoMoney para eu ver","navigate"],
    ["acesse o InfoMoney e traga as principais notícias","research"],
    ["pesquisar as principais noticias no infomoney","research"],
    ["veja no InfoMoney o que saiu sobre Petrobras","research"],
    ["pesquise na internet notícias sobre inflação","research"],
    ["acesse o TechCrunch e resuma as notícias sobre IA","research"],
    ["acesse https://react.dev/reference/react/useEffect e explique useEffect","fetch"],
    ["entre no InfoMoney e clique em Mercados","interact"],
    ["abra o site e faça login","interact"]
  ] as const)("%s -> %s",(text,operation)=>expect(deterministicWebIntent(text)?.operation).toBe(operation));

  it("prioritizes the final information goal over the navigation verb",()=>{
    const intent=deterministicWebIntent("acesse o site InfoMoney e traga as principais notícias");
    expect(intent).toMatchObject({operation:"research",requiresInformation:true,requiresInteraction:false});
    expect(intent?.entities.sourceName?.toLowerCase()).toBe("infomoney");
    expect(intent?.entities.query?.toLowerCase()).toContain("principais notícias");
  });

  it("keeps the 50+ case web intent dataset green",()=>{
    const file=path.resolve("tests/evals/intents/web-research.json");
    const rows=JSON.parse(fs.readFileSync(file,"utf8")) as Array<{input:string;expectedOperation:string}>;
    expect(rows.length).toBeGreaterThanOrEqual(50);
    for(const row of rows)expect(deterministicWebIntent(row.input)?.operation,row.input).toBe(row.expectedOperation);
  });
});
