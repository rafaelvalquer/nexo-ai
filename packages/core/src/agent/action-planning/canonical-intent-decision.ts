export type CanonicalIntentDecision={
  candidateId:string;
  domain:"filesystem"|"web"|"browser"|"email"|"calendar"|"documents"|"system"|"memory";
  operation:string;
  entities:Record<string,unknown>;
  confidence:number;
  source:"exact"|"filesystem"|"hybrid"|"web"|"planner"|"intent_memory"|"clarification";
  evidence:string[];
};
