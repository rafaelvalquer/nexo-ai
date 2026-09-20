import {describe,expect,it} from "vitest";
import {deterministicDomainCandidates} from "../../../packages/core/src/intent/domain/deterministic.js";
describe("Domain resolution",()=>{
  const cases:[string,string][]=[
    ["procure o relatório em Downloads","filesystem"],
    ["procure notícias no InfoMoney","web"],
    ["procure o e-mail do João","email"],
    ["procure o compromisso com João","calendar"],
    ["resuma relatório.pdf","documents"]
  ];
  for(const [text,domain] of cases)it(text,()=>expect(deterministicDomainCandidates(text)[0]?.domain).toBe(domain));
  it("keeps ambiguous generic search unresolved",()=>expect(deterministicDomainCandidates("procure João")).toEqual([]));
});
