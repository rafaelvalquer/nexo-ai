import type { CanonicalIntent, IntentConfidence, IntentResolutionResult } from "./types.js";

export const resolvedIntent=(intent:CanonicalIntent,confidence:IntentConfidence):IntentResolutionResult=>({status:"resolved",intent,confidence});
export const clarificationIntent=(intent:CanonicalIntent,confidence:IntentConfidence,question:string):IntentResolutionResult=>({status:"clarification",intent,confidence,question});
export const unknownIntent=(reason:string,intent?:CanonicalIntent,confidence?:IntentConfidence):IntentResolutionResult=>({status:"unknown",reason,intent,confidence});
