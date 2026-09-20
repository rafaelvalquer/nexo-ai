import type {IntentAction} from "../types.js";
export type IntentOperationContract={intent:IntentAction;allowedEntities:readonly string[];requiredEntities:readonly string[];optionalEntities:readonly string[]};
export function contract(intent:IntentAction,required:readonly string[]=[],optional:readonly string[]=[]):IntentOperationContract{return{intent,requiredEntities:required,optionalEntities:optional,allowedEntities:[...required,...optional]};}
