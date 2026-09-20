import type {IntentLearningEvent} from "./learning-events.js";
export function shouldPromoteLearningEvent(event:IntentLearningEvent){
 if(event.outcome!=="success")return false;
 if(event.source==="user_correction"||event.source==="confirmed_execution")return true;
 if(event.source==="successful_execution")return event.successCount>=2&&event.failureCount===0;
 return false;
}
export function sourceTrust(source:IntentLearningEvent["source"]){return source==="user_correction"?1:source==="confirmed_execution"?0.92:source==="successful_execution"?0.75:0;}
