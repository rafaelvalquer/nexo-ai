import type {ConversationActionContextState} from "../context/conversation-action-context.js";
import type {AgentIntent,ApprovalPlanMetadata,DeferredAction} from "./intent-schema.js";
import type {AgentToolDescriptor} from "./tool-catalog.js";
import {describeDomainTools} from "./tool-catalog.js";
import {CanonicalActionPlanner} from "../action-planning/canonical-action-planner.js";
import type {CanonicalActionPlan,CanonicalEmailDraft} from "../action-planning/canonical-action-plan.js";
import type {CanonicalIntentDecision} from "../action-planning/canonical-intent-decision.js";
import {stableCandidateId} from "../decision/semantic-action-identity.js";

export type BuiltPlanStep={tool:string;input:Record<string,unknown>;explanation?:string;approval?:ApprovalPlanMetadata};
export type EmailComposePlanDraft=CanonicalEmailDraft;
export type BuiltIntentPlan={
  steps?:BuiltPlanStep[];
  direct?:string;
  directStream?:boolean;
  deferredAction?:DeferredAction;
  responseMode?:"synthesize"|"deterministic"|"presentation";
  emailDraft?:EmailComposePlanDraft;
};

/**
 * @deprecated Compatibility wrapper. CanonicalActionPlanner is the only
 * post-intent authority for executable plans.
 */
export function buildIntentPlan(intent:AgentIntent,tools:AgentToolDescriptor[],previous?:ConversationActionContextState):BuiltIntentPlan{
  if(intent.status==="needs_clarification")return{direct:intent.question??"Preciso de mais detalhes antes de continuar."};
  if(intent.domain==="general"&&intent.intent==="answer")return{directStream:true};
  if(intent.intent==="help")return{direct:describeDomainTools(intent.domain,tools)};

  const domain=canonicalDomain(intent.domain),operation=canonicalOperation(intent);
  const entities={...(intent.entities as Record<string,unknown>),...(intent.reference?{reference:intent.reference}:{})};
  const base={
    source:"planner" as const,domain,operation,entities,
    missing:intent.missing??[],ambiguities:[],confidence:intent.confidence,
    proposedTool:intent.operation,mutatesState:intent.requiresConfirmation,evidence:["agent-intent"]
  };
  const decision:CanonicalIntentDecision={
    candidateId:stableCandidateId(base as any),
    domain,operation,entities,confidence:intent.confidence,
    source:"planner",evidence:["agent-intent"]
  };
  const availability={get:(name:string)=>tools.find(tool=>tool.name===name)};
  const plan=new CanonicalActionPlanner(availability).planDecision(decision,{previous});
  return plan?toBuiltPlan(plan):{direct:`Não consegui mapear a operação ${intent.operation} para uma ação segura.`};
}

function toBuiltPlan(plan:CanonicalActionPlan):BuiltIntentPlan{
  return{
    ...(plan.steps.length?{steps:plan.steps.map(step=>({tool:step.tool,input:step.input,explanation:step.explanation,approval:step.approval}))}:{}),
    ...(plan.direct!==undefined?{direct:plan.direct}:{}),
    ...(plan.directStream?{directStream:true}:{}),
    ...(plan.deferredAction?{deferredAction:plan.deferredAction}:{}),
    ...(plan.responseMode?{responseMode:plan.responseMode}:{}),
    ...(plan.emailDraft?{emailDraft:plan.emailDraft}:{})
  };
}
function canonicalOperation(intent:AgentIntent){
  const op=intent.operation;
  if(intent.domain==="email"){
    const map:Record<string,string>={
      recent_messages:"email_latest",latest_message:"email_latest",
      search_messages:"email_search",search:"email_search",
      summarize_previous:"email_get_many",read_previous:"email_get_many",get_many:"email_get_many",
      bulk_trash:"email_trash",trash:"email_trash",delete_messages:"email_trash",
      bulk_archive:"email_archive",archive:"email_archive",
      bulk_mark_read:"email_mark_read",mark_read:"email_mark_read",
      bulk_mark_unread:"email_mark_unread",mark_unread:"email_mark_unread",
      send_message:"email_send",send:"email_send",reply:"email_reply"
    };
    return map[op]??op;
  }
  if(intent.domain==="calendar"){
    const map:Record<string,string>={
      list_events:"calendar_list",search_events:"calendar_search",find_free_time:"calendar_find_free_time",
      create_event:"calendar_create",update_event:"calendar_update",delete_event:"calendar_delete",rsvp:"calendar_rsvp"
    };
    return map[op]??op;
  }
  if(intent.domain==="document"){
    const map:Record<string,string>={read:"document_read",summarize:"document_summarize",extract:"document_extract",compare:"document_compare",create:"document_create"};
    return map[op]??op;
  }
  return op;
}
function canonicalDomain(domain:AgentIntent["domain"]):CanonicalIntentDecision["domain"]{
  return domain==="document"?"documents":domain==="general"?"system":domain;
}
