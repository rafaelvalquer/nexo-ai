import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,stringValue,numberValue,unavailable,formatDate,writeStep} from "./planning-utils.js";
import {selectedPreviousEventIds} from "../context/conversation-action-context.js";
import {addMinutes,resolveDateTime,resolvePeriod} from "../orchestrator/temporal-resolver.js";

export class CalendarActionPlanner implements DomainActionPlanner{
 constructor(private readonly tools:ToolAvailability){}
 plan(decision:CanonicalIntentDecision,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
  const e=decision.entities,op=decision.operation,previous=context.previous,connectionId=stringValue(e.connectionId)??previous?.calendarConnectionId;
  const period=e.period??e.dateRange??e.date??"today",range=resolvePeriod(typeof period==="object"&&period?(period as any).kind??"today":period,new Date(),e.dayPart);
  const query=stringValue(e.query??e.title);

  if(op==="calendar_list"){
    const step=readStep(this.tools,"calendar_list",{start:stringValue(e.start)??range.start,end:stringValue(e.end)??range.end,...(connectionId?{connectionId}:{})},`Consultando sua agenda para ${range.label}…`);
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"calendar_list");
  }
  if(op==="calendar_search"){
    const step=readStep(this.tools,"calendar_search",{start:stringValue(e.start)??range.start,end:stringValue(e.end)??range.end,query,...(connectionId?{connectionId}:{})},"Localizando o compromisso…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"calendar_search");
  }
  if(op==="calendar_get"){
    const eventId=stringValue(e.eventId);if(!eventId)return planBase(decision,[],{direct:"Qual compromisso você quer abrir?"});
    const step=readStep(this.tools,"calendar_get",{eventId,...(connectionId?{connectionId}:{})},"Carregando o compromisso…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"calendar_get");
  }
  if(op==="calendar_find_free_time"){
    const step=readStep(this.tools,"calendar_find_free_time",{start:stringValue(e.start)??range.start,end:stringValue(e.end)??range.end,durationMinutes:numberValue(e.durationMinutes??e.duration,30,5,1440),...(connectionId?{connectionId}:{})},"Procurando horários livres…");
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"calendar_find_free_time");
  }
  if(op==="calendar_create"||op==="calendar_create_agent"){
    const title=stringValue(e.title),explicitStart=stringValue(e.start),explicitEnd=stringValue(e.end);
    const start=explicitStart&&!Number.isNaN(Date.parse(explicitStart))?new Date(explicitStart).toISOString():resolveDateTime(period,e.time??e.startTime);
    const duration=numberValue(e.durationMinutes??e.duration,60,5,1440),end=explicitEnd&&!Number.isNaN(Date.parse(explicitEnd))?new Date(explicitEnd).toISOString():start?addMinutes(start,duration):undefined;
    if(!title)return planBase(decision,[],{direct:"Qual é o título do compromisso?"});if(!start||!end)return planBase(decision,[],{direct:"Qual é a data e o horário do compromisso?"});
    const tool=this.tools.get(op)?op:"calendar_create";
    const step=writeStep(this.tools,tool,{title,start,end,location:stringValue(e.location),description:stringValue(e.description),attendees:e.attendees,...(connectionId?{connectionId}:{})},"Preparando o compromisso para sua confirmação…",{domain:"calendar",actionType:"create",preview:`${title}\n${formatDate(start)} – ${formatDate(end)}`,affectedCount:1,consequence:"Um novo compromisso será criado na sua agenda.",expiresInMs:10*60_000});
    return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,tool);
  }
  if(op==="calendar_delete"||op==="calendar_update"){
    let eventId=stringValue(e.eventId);const previousIds=selectedPreviousEventIds(previous,(e.reference as any)??undefined);if(!eventId&&previousIds.length===1)eventId=previousIds[0];
    if(eventId){
      if(op==="calendar_delete"){
        const step=writeStep(this.tools,"calendar_delete",{eventId,...(connectionId?{connectionId}:{})},"Preparando o cancelamento para sua confirmação…",{domain:"calendar",actionType:"delete",affectedCount:1,preview:eventPreview(previous,eventId),consequence:"O compromisso será cancelado.",expiresInMs:5*60_000});
        return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,"calendar_delete");
      }
      const patch=calendarPatch(e,period);if(!Object.keys(patch).length)return planBase(decision,[],{direct:"O que você quer alterar nesse compromisso?"});
      const step=writeStep(this.tools,"calendar_update",{eventId,...patch,...(connectionId?{connectionId}:{})},"Preparando a alteração para sua confirmação…",{domain:"calendar",actionType:"update",affectedCount:1,preview:`${eventPreview(previous,eventId)}\nAlterações: ${JSON.stringify(patch)}`,consequence:"O compromisso será alterado.",expiresInMs:10*60_000});
      return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,"calendar_update");
    }
    const search=readStep(this.tools,"calendar_search",{start:range.start,end:range.end,query,...(connectionId?{connectionId}:{})},"Localizando o compromisso exato…");
    if(!search)return unavailable(decision,"calendar_search");
    return planBase(decision,[search],{deferredAction:op==="calendar_delete"?{kind:"calendar.delete",query}:{kind:"calendar.update",query,patch:calendarPatch(e,period)},responseMode:"deterministic",requiresApproval:true});
  }
  if(op==="calendar_rsvp"){
    const eventId=stringValue(e.eventId),response=stringValue(e.response);if(!eventId||!response)return planBase(decision,[],{direct:"Qual compromisso e qual resposta de presença você quer usar?"});
    const step=writeStep(this.tools,"calendar_rsvp",{eventId,response,...(connectionId?{connectionId}:{})},"Preparando sua resposta ao convite…",{domain:"calendar",actionType:"rsvp",affectedCount:1,preview:eventId,consequence:"Sua resposta ao convite será atualizada.",expiresInMs:10*60_000});
    return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,"calendar_rsvp");
  }
  return undefined;
 }
}
function calendarPatch(e:Record<string,unknown>,period:unknown){const patch:Record<string,unknown>={};const title=stringValue(e.newTitle??e.title);if(title)patch.title=title;const time=e.newTime??e.time??e.startTime;const start=time?resolveDateTime(e.newDate??e.date??period,time):stringValue(e.start);if(start){patch.start=start;patch.end=stringValue(e.end)??addMinutes(start,numberValue(e.durationMinutes??e.duration,60,5,1440));}const location=stringValue(e.location);if(location)patch.location=location;const description=stringValue(e.description);if(description)patch.description=description;if(e.attendees!==undefined)patch.attendees=e.attendees;return patch;}
function eventPreview(previous:CanonicalPlanningContext["previous"],id:string){const event=previous?.events?.find(item=>item.id===id);return event?`${event.title??"Compromisso"}${event.start?`\n${formatDate(event.start)}`:""}`:`Compromisso ${id}`;}
