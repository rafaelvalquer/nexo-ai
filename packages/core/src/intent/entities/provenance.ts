export type EntityProvenance="user"|"clarification"|"current_turn"|"previous_result"|"entity_ledger"|"conversation_history"|"intent_memory";
export type ResolvedIntentEntity={value:unknown;source:EntityProvenance;confidence:number;verified?:boolean};
export const provenancePriority:Record<EntityProvenance,number>={user:100,clarification:90,current_turn:80,previous_result:70,entity_ledger:60,conversation_history:50,intent_memory:10};
