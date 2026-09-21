import type {ApprovalPlanMetadata,DeferredAction} from "../orchestrator/intent-schema.js";

export type ClarificationType=
  |"DOMAIN_AMBIGUITY"
  |"OPERATION_AMBIGUITY"
  |"ENTITY_AMBIGUITY"
  |"MISSING_ENTITY"
  |"DESTINATION_AMBIGUITY";

export type StructuredExecutableRoute={
  tool:string;
  input:Record<string,unknown>;
  explanation?:string;
  approval?:ApprovalPlanMetadata;
  deferredAction?:DeferredAction;
  responseMode?:"synthesize"|"deterministic"|"presentation";
};

export type ClarificationOption={
  id:string;
  label:string;
  description?:string;
  candidateId?:string;
  entities?:Record<string,unknown>;
  action?:{domain:string;operation:string;proposedTool?:string};
  route?:StructuredExecutableRoute;
  metadata?:{icon?:string;path?:string;size?:number;modifiedAt?:string};
};

export type StructuredClarification={
  id:string;
  type:ClarificationType;
  question:string;
  options:ClarificationOption[];
  allowFreeText:boolean;
  originalRequest:string;
  expiresAt:string;
};
