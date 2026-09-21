import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,stringValue,boolValue,numberValue,unavailable} from "./planning-utils.js";
import {selectedPreviousEmailIds} from "../context/conversation-action-context.js";
import {defaultEmailSubject,normalizeBody,normalizeRecipientsFromEntities} from "../../email/compose/normalizer.js";

export class EmailActionPlanner implements DomainActionPlanner{
 constructor(private readonly tools:ToolAvailability){}
 plan(decision:CanonicalIntentDecision,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
  const e=decision.entities,op=decision.operation,previous=context.previous;
  const previousIds=selectedPreviousEmailIds(previous,(e.reference as any)??undefined);
  const sender=stringValue(e.sender??e.from),subject=stringValue(e.subject);
  const query=stringValue(e.query)??([sender?`from:${sender}`:"",subject?`subject:"${subject.replace(/"/g,"")}"`:""].filter(Boolean).join(" ")||undefined);
  const unread=boolValue(e.unread),maxResults=numberValue(e.maxResults??e.limit,20,1,50);
  const connectionId=stringValue(e.connectionId)??previous?.emailConnectionId;

  if(op==="email_latest"){
    const step=readStep(this.tools,"email_latest",{...(connectionId?{connectionId}:{})},"Buscando o e-mail mais recente…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"email_latest");
  }
  if(op==="email_search"){
    const step=readStep(this.tools,"email_search",{query,unread,maxResults,...(connectionId?{connectionId}:{})},"Consultando os e-mails…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"email_search");
  }
  if(op==="email_get"||op==="email_read"){
    const messageId=stringValue(e.messageId);if(!messageId)return planBase(decision,[],{direct:"Qual e-mail você quer abrir?"});
    const step=readStep(this.tools,op==="email_read"&&this.tools.get("email_read")?"email_read":"email_get",{messageId,...(connectionId?{connectionId}:{})},"Carregando o e-mail…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"email_get");
  }
  if(op==="email_get_many"){
    const ids=Array.isArray(e.messageIds)?e.messageIds.map(String):previousIds;
    if(!ids.length)return planBase(decision,[],{direct:"Quais e-mails você quer abrir?"});
    const step=readStep(this.tools,"email_get_many",{messageIds:ids.slice(0,30),...(connectionId?{connectionId}:{})},"Carregando os e-mails selecionados…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"email_get_many");
  }
  if(op==="email_send"||op==="email_send_composed"){
    const recipients=normalizeRecipientsFromEntities(e),body=normalizeBody(e);
    if(!recipients.length||!body)return planBase(decision,[],{direct:"Informe o destinatário e a mensagem do e-mail."});
    const resolvedSubject=subject??defaultEmailSubject(body);
    return planBase(decision,[],{emailDraft:{to:recipients,subject:resolvedSubject,bodyText:body,...(connectionId?{connectionId}:{})},responseMode:"deterministic",requiresApproval:true,expectedEffect:"email_sent"});
  }

  const action=emailMutation(op);
  if(action){
    const messageId=stringValue(e.messageId);
    if(messageId){
      const tool=`email_${action}`;
      if(!this.tools.get(tool))return unavailable(decision,tool);
      const step={tool,input:{messageId,...(connectionId?{connectionId}:{})},explanation:"Preparando a alteração do e-mail para sua confirmação…",approval:{domain:"email",actionType:action,affectedCount:1,preview:subject??sender??messageId,consequence:emailConsequence(action,1),expiresInMs:action==="trash"?5*60_000:10*60_000}};
      return planBase(decision,[step],{responseMode:"deterministic",requiresApproval:true});
    }
    const ids=previousIds.length?filterPreviousEmailIds(previousIds,previous,sender):[];
    if(ids.length){
      const lookup=readStep(this.tools,"email_get_many",{messageIds:ids.slice(0,30),...(connectionId?{connectionId}:{})},"Verificando os e-mails selecionados…");
      return lookup?planBase(decision,[lookup],{deferredAction:{kind:"email.bulk",action,sender,subject,receivedAt:stringValue(e.receivedAt),allowMultiple:ids.length>1},responseMode:"deterministic",requiresApproval:true}):unavailable(decision,"email_get_many");
    }
    const search=readStep(this.tools,"email_search",{query,unread,maxResults:Math.max(maxResults,20),...(connectionId?{connectionId}:{})},"Localizando exatamente os e-mails que podem ser alterados…");
    return search?planBase(decision,[search],{deferredAction:{kind:"email.bulk",action,sender,subject,receivedAt:stringValue(e.receivedAt),allowMultiple:e.allowMultiple===true},responseMode:"deterministic",requiresApproval:true}):unavailable(decision,"email_search");
  }

  if(op==="email_reply"){
    const messageId=stringValue(e.messageId),body=stringValue(e.body);if(!messageId||!body)return planBase(decision,[],{direct:"Qual e-mail você quer responder e qual é a mensagem?"});
    if(!this.tools.get("email_reply"))return unavailable(decision,"email_reply");
    const step={tool:"email_reply",input:{messageId,body,...(connectionId?{connectionId}:{})},explanation:"Preparando a resposta para sua confirmação…",approval:{domain:"email",actionType:"reply",affectedCount:1,preview:subject??messageId,consequence:"Uma resposta será enviada.",expiresInMs:10*60_000}};
    return planBase(decision,[step],{responseMode:"deterministic",requiresApproval:true});
  }
  return undefined;
 }
}
function emailMutation(op:string):"trash"|"archive"|"mark_read"|"mark_unread"|undefined{
 if(/trash|delete|lixeira|apagar/.test(op))return"trash";
 if(/archive|arquiv/.test(op))return"archive";
 if(/mark_unread|unread|nao_lido/.test(op))return"mark_unread";
 if(/mark_read|read/.test(op)&&op.startsWith("email_mark"))return"mark_read";
 return undefined;
}
function emailConsequence(action:string,count:number){return action==="trash"?`${count} e-mail(s) serão movidos para a lixeira.`:action==="archive"?`${count} e-mail(s) serão arquivados.`:action==="mark_read"?`${count} e-mail(s) serão marcados como lidos.`:`${count} e-mail(s) serão marcados como não lidos.`;}
function filterPreviousEmailIds(ids:string[],previous:CanonicalPlanningContext["previous"],sender?:string){if(!sender)return ids;const normalized=sender.toLowerCase(),allowed=new Set((previous?.emails??[]).filter(item=>item.from?.toLowerCase().includes(normalized)).map(item=>item.id));return ids.filter(id=>allowed.has(id));}
