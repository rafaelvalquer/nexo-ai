import type {ApprovalPlanMetadata,DeferredAction} from "../orchestrator/intent-schema.js";

export type CanonicalActionStep={
  tool:string;
  input:Record<string,unknown>;
  explanation?:string;
  approval?:ApprovalPlanMetadata;
};

export type CanonicalActionPlan={
  id:string;
  domain:"filesystem"|"web"|"browser"|"email"|"calendar"|"documents"|"system";
  operation:string;
  entities:Record<string,unknown>;
  steps:CanonicalActionStep[];
  deferredAction?:DeferredAction;
  requiresApproval:boolean;
  expectedEffect:string;
  source:{
    candidateId:string;
    decisionSource:"exact"|"filesystem"|"hybrid"|"web"|"clarification"|"planner"|"intent_memory";
  };
};
