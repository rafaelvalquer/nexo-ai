import { describe, expect, it } from "vitest";
import { validateBrowserResearchResult } from "../../packages/core/src/browser-agent/result-validator";

const valid={summary:"Resumo",sources:[{title:"InfoMoney",url:"https://www.infomoney.com.br/mercados/a"}],findings:[{title:"Selic",summary:"Resumo da matéria",sourceUrl:"https://www.infomoney.com.br/mercados/a"}]};
describe("Browser Agent result validation",()=>{
  it("accepts visited sources under an allowed wildcard",()=>expect(validateBrowserResearchResult(valid,["*.infomoney.com.br"])).toEqual(valid));
  it("rejects sources outside the domain policy",()=>expect(()=>validateBrowserResearchResult({...valid,sources:[{title:"Outro",url:"https://example.com/a"}]},["*.infomoney.com.br"])).toThrow(/domínio permitido/i));
  it("rejects findings whose source was not declared",()=>expect(()=>validateBrowserResearchResult({...valid,findings:[{title:"x",summary:"y",sourceUrl:"https://www.infomoney.com.br/outra"}]},["*.infomoney.com.br"])).toThrow(/fonte declarada/i));
});
