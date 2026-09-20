import type {AgentIntent} from "../orchestrator/intent-schema.js";
import type {GoalOutcome} from "../outcome/types.js";
import type {LocalMetricsService} from "../../observability/metrics.js";
import {IntentLearningEventStore,type LearningFailureType} from "./learning-events.js";
import {IntentMemorySanitizer} from "./sanitizer.js";
import {IntentMemoryStore,type IntentExampleSource} from "./store.js";
import {shouldPromoteLearningEvent} from "./promotion-policy.js";
export class IntentLearningCoordinator{
 private readonly sanitizer=new IntentMemorySanitizer();
 constructor(private readonly events:IntentLearningEventStore,private readonly memory:IntentMemoryStore,private readonly metrics?:LocalMetricsService){}
 recordVerified(input:{utterance:string;intent:AgentIntent;source:IntentExampleSource;outcome:GoalOutcome;unresolvedAmbiguity?:boolean;resolverVersion?:string;modelId?:string;embedding?:number[]}){
  if(input.intent.status!=="ready"||!input.outcome.verified)return;
  const pattern=this.sanitizer.sanitize(input.utterance),outcome=input.outcome.status==="success"?"success":input.outcome.status==="partial"?"partial":"failed";
  const event=this.events.record({utterancePattern:pattern,domain:input.intent.domain,operation:input.intent.operation,entitiesSignature:this.sanitizer.entitiesSignature(input.intent.entities??{}),source:input.source,outcome,confidence:input.intent.confidence,resolverVersion:input.resolverVersion??"intent-learning-v3",modelId:input.modelId,failureType:input.outcome.status==="success"?undefined:"goal_not_satisfied"});
  if(input.outcome.status!=="success"||input.unresolvedAmbiguity){this.metrics?.record("intent.memory.failure_recorded",1,{domain:input.intent.domain,operation:input.intent.operation});return;}
  if(shouldPromoteLearningEvent(event)){this.memory.remember(pattern,input.intent,input.source,input.embedding,{successCount:event.successCount,failureCount:event.failureCount,lastVerifiedAt:event.lastVerifiedAt,resolverVersion:event.resolverVersion,modelId:event.modelId});this.metrics?.record("intent.memory.success_promoted",1,{source:input.source,domain:input.intent.domain});}
 }
 recordFailure(input:{utterance:string;domain:string;operation:string;confidence:number;failureType:LearningFailureType;resolverVersion?:string;modelId?:string}){
  this.events.record({utterancePattern:this.sanitizer.sanitize(input.utterance),domain:input.domain,operation:input.operation,entitiesSignature:"",source:"negative",outcome:"failed",confidence:input.confidence,resolverVersion:input.resolverVersion??"intent-learning-v3",modelId:input.modelId,failureType:input.failureType});
  this.metrics?.record("intent.memory.failure_recorded",1,{type:input.failureType});
 }
}
