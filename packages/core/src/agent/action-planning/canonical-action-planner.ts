import type {ToolRegistry} from "../../tools/registry.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalPlanningContext,DomainActionPlanner,ToolAvailability} from "./planning-types.js";
import {FilesystemActionPlanner} from "./filesystem-action-planner.js";
import {WebActionPlanner} from "./web-action-planner.js";
import {BrowserActionPlanner} from "./browser-action-planner.js";
import {EmailActionPlanner} from "./email-action-planner.js";
import {CalendarActionPlanner} from "./calendar-action-planner.js";
import {DocumentActionPlanner} from "./document-action-planner.js";
import {SystemActionPlanner} from "./system-action-planner.js";
import {planBase,readStep,unavailable} from "./planning-utils.js";
import {stableCandidateId} from "../decision/semantic-action-identity.js";
import type {DecisionCandidateSource} from "../decision/types.js";

export type CanonicalActionRequest={
  domain:string;
  operation:string;
  entities:Record<string,unknown>;
  candidateId?:string;
  decisionSource:CanonicalActionPlan["source"]["decisionSource"];
  confidence?:number;
  evidence?:string[];
};

export class CanonicalActionPlanner{
  private readonly planners:Record<string,DomainActionPlanner>;
  constructor(private readonly tools:ToolAvailability){
    this.planners={
      filesystem:new FilesystemActionPlanner(tools),
      web:new WebActionPlanner(tools),
      browser:new BrowserActionPlanner(tools),
      email:new EmailActionPlanner(tools),
      calendar:new CalendarActionPlanner(tools),
      documents:new DocumentActionPlanner(tools),
      system:new SystemActionPlanner(tools)
    };
  }

  static fromRegistry(registry:ToolRegistry){return new CanonicalActionPlanner(registry);}

  planDecision(decision:CanonicalIntentDecision,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
    const planner=this.planners[decision.domain];
    const planned=planner?.plan(decision,context);
    if(planned)return planned;
    const definition=this.tools.get(decision.operation);
    if(!definition)return unavailable(decision,decision.operation);
    const step=readStep(this.tools,decision.operation,{...decision.entities},`Executando ${decision.operation.replace(/_/g," ")}…`);
    if(!step)return undefined;
    return planBase(decision,[step],{requiresApproval:Boolean(definition.mutatesState),responseMode:definition.mutatesState?"deterministic":"presentation"});
  }

  plan(request:CanonicalActionRequest,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
    const base={
      source:request.decisionSource as DecisionCandidateSource,
      domain:canonicalDomain(request.domain),
      operation:request.operation,
      entities:{...request.entities},
      missing:[],ambiguities:[],confidence:request.confidence??1,mutatesState:Boolean(this.tools.get(request.operation)?.mutatesState),evidence:request.evidence??[]
    };
    const candidateId=request.candidateId??stableCandidateId(base as any);
    return this.planDecision({candidateId,domain:canonicalDomain(request.domain),operation:request.operation,entities:{...request.entities},confidence:request.confidence??1,source:request.decisionSource,evidence:request.evidence??[]},context);
  }
}
function canonicalDomain(value:string):CanonicalIntentDecision["domain"]{
  if(value==="document"||value==="documents")return"documents";
  if(value==="filesystem"||value==="web"||value==="browser"||value==="email"||value==="calendar"||value==="system"||value==="memory")return value;
  return"system";
}
