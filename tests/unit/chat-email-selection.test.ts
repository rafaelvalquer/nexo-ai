import { expect,it } from "vitest";
import { materializeDeferredAction } from "../../packages/core/src/agent/orchestrator/action-preflight";
import {buildIntentPlan} from "../../packages/core/src/agent/orchestrator/plan-builder";
import {observeConversationActionContext} from "../../packages/core/src/agent/context/conversation-action-context";
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
it("previous-result follow-ups retain the account identity and an explicit first-two selection",()=>{
  const previous=observeConversationActionContext(undefined,"Listar",undefined,{tool:"email_search",input:{connectionId:"original-account"}},{ok:true,summary:"3",data:{messages}});
  const intent:any={schemaVersion:1,status:"ready",domain:"email",intent:"delete",operation:"trash",entities:{},referencesPreviousResult:true,reference:{source:"previous_result",selection:{type:"first",count:2}},requiresDataLookup:true,requiresConfirmation:true,confidence:1};
  const tool:any={name:"email_get_many",domain:"email",operation:"read",description:"Read",risk:"READ",mutatesState:false,requiresConfirmation:false,permissions:[]};
  const plan=buildIntentPlan(intent,[tool],previous);
  expect(plan.steps?.[0]).toMatchObject({tool:"email_get_many",input:{connectionId:"original-account",messageIds:["exact-1","exact-2"]}});
  expect(plan.deferredAction).toMatchObject({allowMultiple:true});
});
it("a statistics lookup on another account does not rebind the previous message IDs",()=>{
  const previous=observeConversationActionContext(undefined,"Listar",undefined,{tool:"email_search",input:{connectionId:"account-a"}},{ok:true,summary:"3",data:{messages}});
  const next=observeConversationActionContext(previous,"Estatísticas",undefined,{tool:"email_stats",input:{connectionId:"account-b"}},{ok:true,summary:"Estatísticas",data:{totalMessages:10}});
  expect(next.emailConnectionId).toBe("account-a");expect(next.emails?.[0].id).toBe("exact-1");
});
