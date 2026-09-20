import {describe,expect,it,vi} from "vitest";
import {WebSourceResolver} from "../../../packages/core/src/web/source-resolver.js";
describe("WebSourceResolver",()=>{
  it("uses explicit URL as authoritative",async()=>{const resolver=new WebSourceResolver({search:vi.fn()} as any);await expect(resolver.resolve({sourceName:"InfoMoney",url:"https://www.infomoney.com.br/mercados/"})).resolves.toMatchObject({domain:"infomoney.com.br",url:"https://www.infomoney.com.br/mercados/"});});
  it("resolves a site name through real-search semantics instead of inventing a domain",async()=>{const search=vi.fn(async()=>({query:"",results:[{title:"InfoMoney - Informação que vale dinheiro",url:"https://www.infomoney.com.br/",snippet:""}]}));const resolver=new WebSourceResolver({search} as any);await expect(resolver.resolve({sourceName:"InfoMoney"})).resolves.toMatchObject({name:"InfoMoney",domain:"infomoney.com.br",url:"https://www.infomoney.com.br/"});expect(search).toHaveBeenCalledWith("InfoMoney site oficial",5,undefined);});
});
