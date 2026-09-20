import type {RetrievedIntentExample} from "../intent-memory/retriever.js";
import type {ConversationEntity} from "../resolution/entity-reference-resolver.js";
import type {ConversationActionContextState} from "./conversation-action-context.js";
import {contextSnapshotFromActionState,type ContextSnapshot} from "./context-snapshot.js";

export const CONTEXT_TTL={previousResult:2,lastIntent:3,entityLedger:5} as const;

export class ContextSnapshotBuilder{
 build(input:{conversationId:string;turn:number;state?:ConversationActionContextState;previousResultTurnAge?:number;ledger?:ConversationEntity[];memoryCandidates?:RetrievedIntentExample[];recentMessages?:ContextSnapshot["recentMessages"];pendingClarification?:ContextSnapshot["pendingClarification"]}):ContextSnapshot{
  const snapshot=contextSnapshotFromActionState(input);
  return{
   ...snapshot,
   recentEntities:snapshot.recentEntities.filter(item=>item.source==="previous_result"?item.turnAge<=CONTEXT_TTL.previousResult:item.source==="entity_ledger"?item.turnAge<=CONTEXT_TTL.entityLedger:true),
   lastIntent:snapshot.lastIntent&&snapshot.lastIntent.turnAge<=CONTEXT_TTL.lastIntent?snapshot.lastIntent:undefined
  };
 }
}
