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

  const domain=canonicalDomain(intent.domain);
  const entities={...(intent.entities as Record<string,unknown>),...(intent.reference?{reference:intent.reference}:{})};
  const base={
    source:"planner" as const,domain,operation:intent.operation,entities,
    missing:intent.missing??[],ambiguities:[],confidence:intent.confidence,
    proposedTool:intent.operation,mutatesState:intent.requiresConfirmation,evidence:["agent-intent"]
  };
  const decision:CanonicalIntentDecision={
    candidateId:stableCandidateId(base as any),
    domain,operation:intent.operation,entities,confidence:intent.confidence,
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
function canonicalDomain(domain:AgentIntent["domain"]):CanonicalIntentDecision["domain"]{
  return domain==="document"?"documents":domain==="general"?"system":domain;
}
