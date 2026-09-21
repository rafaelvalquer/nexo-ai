import type {ApprovalPlanMetadata,DeferredAction} from "../orchestrator/intent-schema.js";

export type CanonicalActionStep={
  tool:string;
  input:Record<string,unknown>;
  explanation?:string;
  approval?:ApprovalPlanMetadata;
};

export type CanonicalEmailDraft={to:string[];subject:string;bodyText:string;connectionId?:string};

export type CanonicalActionPlan={
  id:string;
  domain:"filesystem"|"web"|"browser"|"email"|"calendar"|"documents"|"system"|"memory";
  operation:string;
  entities:Record<string,unknown>;
  steps:CanonicalActionStep[];
  deferredAction?:DeferredAction;
  direct?:string;
  directStream?:boolean;
  responseMode?:"synthesize"|"deterministic"|"presentation";
  emailDraft?:CanonicalEmailDraft;
  requiresApproval:boolean;
  expectedEffect:string;
  source:{
    candidateId:string;
    decisionSource:"exact"|"filesystem"|"hybrid"|"web"|"clarification"|"planner"|"intent_memory";
  };
};
