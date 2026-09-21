import type {ConversationActionContextState} from "../context/conversation-action-context.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";

export type ToolAvailability={
  get(name:string):{mutatesState?:boolean;risk?:string}|undefined;
};

export type CanonicalPlanningContext={
  previous?:ConversationActionContextState;
  originalText?:string;
};

export interface DomainActionPlanner{
  plan(decision:CanonicalIntentDecision,context:CanonicalPlanningContext):CanonicalActionPlan|undefined;
}
