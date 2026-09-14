import { expect,it } from "vitest";
import { materializeDeferredAction } from "../../packages/core/src/agent/orchestrator/action-preflight";
const messages=[
  {id:"exact-1",subject:"Encontramos 9 novas babás",from:{email:"info@sitly.com.br"},receivedAt:"2026-09-14T11:05:00Z"},
  {id:"exact-2",subject:"Encontramos 9 novas babás",from:{email:"info@sitly.com.br"},receivedAt:"2026-09-13T11:05:00Z"},
  {id:"other",subject:"Outra mensagem",from:{email:"info@sitly.com.br"},receivedAt:"2026-09-14T11:05:00Z"},
];
it("combines exact subject, sender and date before freezing a single message ID",()=>{
  const result=materializeDeferredAction({kind:"email.bulk",action:"trash",subject:"Encontramos 9 novas babás",sender:"info@sitly.com.br",receivedAt:"2026-09-14T11:05:00Z"},{ok:true,summary:"3",data:{messages}});
  expect(result.step).toMatchObject({tool:"email_trash",input:{messageId:"exact-1"},approval:{affectedCount:1}});
});
it("ambiguous singular requests do not silently become a bulk action",()=>{
  const result=materializeDeferredAction({kind:"email.bulk",action:"trash",subject:"Encontramos 9 novas babás",sender:"info@sitly.com.br"},{ok:true,summary:"3",data:{messages}});
  expect(result.step).toBeUndefined();expect(result.direct).toContain("Escolha nos cards");
});
it("explicit bulk selection preserves precisely matching IDs",()=>{
  const result=materializeDeferredAction({kind:"email.bulk",action:"archive",subject:"Encontramos 9 novas babás",allowMultiple:true},{ok:true,summary:"3",data:messages});
  expect(result.step).toMatchObject({tool:"email_bulk_archive",input:{messageIds:["exact-1","exact-2"]}});
});
it("does not loosen an exact ID or sender filter when no matching resource exists",()=>{
  const result=materializeDeferredAction({kind:"email.bulk",action:"trash",messageId:"missing",sender:"info@sitly.com.br"},{ok:true,summary:"3",data:{messages}});
  expect(result.step).toBeUndefined();expect(result.direct).toContain("Nenhum e-mail");
});
