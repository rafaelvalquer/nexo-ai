import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,unavailable} from "./planning-utils.js";

export class SystemActionPlanner implements DomainActionPlanner{
 constructor(private readonly tools:ToolAvailability){}
 plan(decision:CanonicalIntentDecision,_context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
  const step=readStep(this.tools,decision.operation,{...decision.entities},`Executando ${decision.operation.replace(/_/g," ")}…`);
  return step?planBase(decision,[step],{responseMode:"presentation"}):unavailable(decision,decision.operation);
 }
}
